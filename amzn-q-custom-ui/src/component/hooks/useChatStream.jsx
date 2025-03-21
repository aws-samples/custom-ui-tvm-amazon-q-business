// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { useState, useCallback, useRef } from 'react';
import { fromWebToken } from "@aws-sdk/credential-providers";
import { Sha256 } from "@aws-crypto/sha256-browser";
import { SignatureV4 } from '@smithy/signature-v4';
import { HttpRequest } from '@aws-sdk/protocol-http';
import { encodeEventStream } from '../utils/eventStreamEncoder';
import { decodeEventStream } from '../utils/eventStreamDecoder';
import errorMap from '../utils/notifications_en.json';
import { v4 as uuidv4 } from 'uuid';

/**Firefox struggles with real time streaming so we will use batching */
const isFirefox = typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent);
const isNullOrUndefined = (value) => value === null || value === undefined;

const generateCanonicalQueryString = (url, query) => {
      const conon_url = url;
      conon_url.searchParams.append('X-Amz-Algorithm', query['X-Amz-Algorithm'])
      conon_url.searchParams.append('X-Amz-Credential', query['X-Amz-Credential'])
      conon_url.searchParams.append('X-Amz-Date', query['X-Amz-Date'])
      conon_url.searchParams.append('X-Amz-Expires', query['X-Amz-Expires'])
      conon_url.searchParams.append('X-Amz-Security-Token', query['X-Amz-Security-Token'])
      conon_url.searchParams.append('X-Amz-Signature', query['X-Amz-Signature'])
      conon_url.searchParams.append('X-Amz-SignedHeaders', query['X-Amz-SignedHeaders'])
      conon_url.searchParams.append('chat-input', query['chat-input'])
      return conon_url;
  };

const useChatStream = ({ issuer, appId, roleArn, region, email, mode }) => {
  // const { data: credentials, isLoading: loadingClient } = useQbizCredentials(issuer, email, region, roleArn);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);

  const socketRef = useRef(null);
  const isFirstChunkRef = useRef(true);
  const messageQueueRef = useRef([]);
  const isProcessingRef = useRef(false);

  const SERVICE = 'qbusiness';
  const WEBSOCKET_ENDPOINT = `wss://qbusiness.${region}.api.aws:8443/chat`;

  const closeConnection = useCallback(() => {
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.close();
            setIsStreaming(false);
            setIsLoading(false);
            // isFirstChunkRef.current = true;
        }
    }, []);

  const getSignedUrl = async (credentials, payload) => {
    const sigV4 = new SignatureV4({
      credentials,
      region,
      service: SERVICE,
      sha256: Sha256,
      uriEscapePath: true
    });

    const chatInput = JSON.stringify({
      applicationId: appId,
      userID: email,
      userGroups: null,
      conversationId: payload["conversationId"] || null, 
      parentMessageId: payload["parentMessageId"] || null,
      clientToken: uuidv4(),
    });

    const request = new HttpRequest({
      method: 'GET',
      protocol: 'wss',
      hostname: `qbusiness.${region}.api.aws`,
      port: 8443,
      path: '/chat',
      query: { 'chat-input': chatInput },
      headers: { host: `qbusiness.${region}.api.aws:8443` },
    });

    const signedRequest = await sigV4.presign(request, { expiresIn: 900 });
    const url = new URL(`${WEBSOCKET_ENDPOINT}`);
    return {
            signedUrl: generateCanonicalQueryString(url, signedRequest.query),
            signature: signedRequest.query['X-Amz-Signature'],
            sigV4
        };
  };

  const fetchIdToken = async () => {
    const dummyAuth = btoa('dummy-client:dummy-secret');
    const response = await fetch(`${issuer}/token`, {
      method: 'POST',
      headers: { 
        'Authorization': `Basic ${dummyAuth}`,
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) throw new Error('Failed to fetch ID token');
    const data = await response.json();
    return data.id_token;
  };

  /**
   * This is a special function for Firefox since streaming and rendering
   * causes rendering race conditions in FF. This function does batching
   * to prevent out of order messages instead of streaming directly back
   * to the component.
   */
  const processMessageQueue = async (onMessageCallback) => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;

      let textBuffer = '';

      // BUFFER_SIZE = 25; // More real-time, might be less smooth (ideal) 
      // BUFFER_SIZE = 10;  // More smooth, less real-time

      const BUFFER_SIZE = 35; 

      while (messageQueueRef.current.length > 0) {
          const event = messageQueueRef.current.shift();
          try {
              const { eventType, data } = await decodeEventStream(event.data);

              if (eventType === 'textEvent') {
                  if (isFirstChunkRef.current) {
                      setIsLoading(false);
                      setIsStreaming(true);
                      isFirstChunkRef.current = false;
                  }
                  
                  textBuffer += data;
                  if (textBuffer.length >= BUFFER_SIZE || messageQueueRef.current.length === 0) {
                      onMessageCallback(eventType, textBuffer);
                      textBuffer = '';
                  }
              } else if (eventType === 'metadataEvent') {
                  if (textBuffer.length > 0) {
                      onMessageCallback('textEvent', textBuffer);
                  }

                  const sourceAttributions = data.sourceAttributions.map(item => ({
                    title: item.title,
                    citationNumber: item.citationNumber,
                    url: item.url,
                    snippet: item.snippet,
                    citationMarkers: item.textMessageSegments.map(it => ({
                      beginOffset: it.beginOffset,
                      endOffset: it.endOffset,
                      snippet: it?.snippetExcerpt?.text || ''
                    }))
                  }));

                  onMessageCallback(eventType, {
                      systemMessage: data.finalTextMessage,
                      conversationId: data.conversationId,
                      userMessageId: data.userMessageId,
                      parentMessageID: data.systemMessageId,
                      source: sourceAttributions,
                  });
                  socketRef.current.close();
              }
          } catch (err) {
              setIsStreaming(false);
              setIsLoading(false);
              setError(errorMap.error['internal-server']);
              socketRef.current.close();
          }
      }
      isProcessingRef.current = false;
  };

  const handleSocketCloseOrErr = async(e) => {
    setIsStreaming(false);
    setIsLoading(false);
              
    // Handle timeout code
    if (e.code === 1006) {
      setError(errorMap.error['server-stopped-responding']);
    }

    // Handle message frame overflow
    else if (e.code === 1009) {
      setError(errorMap.error['message-length-exceeded']);
    }

    // Internal server error
    else if (e.code === 1011) {
      const { data: exceptionMessage, exceptionType } = await decodeEventStream(e.data);
      switch (exceptionType) {
        case "AccessDeniedException":
          errorMessage = exceptionMessage;
          break;

        case "LicenseNotFoundException":
          errorMessage = errorMap.error['license-not-found'];
          break;

        case "ResourceNotFoundException":
          errorMessage = errorMap.error['client-side-error'];
          break;

        case "ThrottlingException":
          errorMessage = exceptionMessage === "Server is too busy to satisfy this request. Please try again later."
            ? errorMap.error.throttling
            : errorMap.error['chat-throttling'];
          break;

        case "ExpiredTokenException":
          errorMessage = errorMap.error['expired-token'];
          break;

        case "ValidationException":
          errorMessage = errorMap.error['input-too-long']
          break;
      }
      setError(errorMessage);
    }

    else{
      setError(errorMap.error['internal-server']);
    }
  }

  const initializeWebSocket = async (onMessageCallback, chatPayload) => {
    try {
      const credentials = await fromWebToken({
        roleArn,
        webIdentityToken: await fetchIdToken(),
        clientConfig: { region },
      })();

      const {signedUrl, signature, sigV4} = await getSignedUrl(credentials,chatPayload);
      const ws = new WebSocket(signedUrl);

      ws.onopen = async() => {        
        const configurationPayload = {
          chatMode: 'RETRIEVAL_MODE',
          ...(mode === 'authenticated' && { chatModeConfiguration: {} }),
          ...(chatPayload["attributeFilter"] && {attributeFilter: chatPayload["attributeFilter"]})
        };
        /**
         * Three events are sent to the ws
         * - configurationEvent : Configure the chat session in retrieval mode (optional)
         * - textEvent: This is the chat frame (required)
         * - endOfInputEvent: This is the end of chat frame (required)
         */
        const configFrame = await encodeEventStream('configurationEvent', configurationPayload, sigV4, signature)
        ws.send(configFrame['encodedEvent']);

        const finalMsgPayload = {"userMessage": chatPayload["userMessage"]}
        const textFrame = await encodeEventStream('textEvent', finalMsgPayload, sigV4, configFrame['signature'])
        ws.send(textFrame['encodedEvent']);

        const endFrame = await encodeEventStream('endOfInputEvent', {}, sigV4, textFrame['signature'])
        ws.send(endFrame['encodedEvent']);        
      };

      ws.onmessage = async(event) => {   
        if(isFirefox){
          messageQueueRef.current.push(event);
          processMessageQueue(onMessageCallback);
        }else{   
          try {
            const { eventType, data } = await decodeEventStream(event.data);
            if (eventType === 'textEvent'){
              if (isFirstChunkRef.current) {
                  setIsLoading(false); //Loading done
                  setIsStreaming(true); //streaming starts
                  isFirstChunkRef.current = false;  
              }
              if (onMessageCallback) onMessageCallback(eventType, data);
            }
            
            if(eventType === 'metadataEvent'){
              const sourceAttributions = data.sourceAttributions.map(item => ({
                  title: item.title,
                  citationNumber: item.citationNumber,
                  url: item.url,
                  snippet: item.snippet,
                  citationMarkers: item.textMessageSegments.map(it => ({
                    beginOffset: it.beginOffset,
                    endOffset: it.endOffset,
                    snippet: it?.snippetExcerpt?.text || ''
                  }))
                }));
              const newData = {
                      systemMessage: data.finalTextMessage,
                      conversationId: data.conversationId,
                      userMessageId: data.userMessageId,
                      parentMessageID: data.systemMessageId,
                      source: sourceAttributions
                  }
              if (onMessageCallback) onMessageCallback(eventType, newData);            
              ws.close();
            }
          } catch (err) {              
              setIsStreaming(false);
              setIsLoading(false);
              setError(errorMap.error['websocket-conn-err']);
              ws.close();
          }
        }
      };

      ws.onclose = async(event) => {
        if(event.code !== 1000){
          await handleSocketCloseOrErr(event);
        }else{
          setIsStreaming(false);
          setIsLoading(false);
          console.warn(`WebSocket closed: ${event.code} - ${event.reason}`);
        }
      };

      /**
       * Need to catch more errors
       */
      ws.onerror = (err) => {
        setIsStreaming(false);
        setIsLoading(false);
        setError(errorMap.error['websocket-conn-err']);
      };

      socketRef.current = ws;
    } catch (err) {
      setError(errorMap.error['intermediate-err']);
    }
  };

  const sendMessage = useCallback(
    async (userMessage, conversationId, parentMessageId, attributeFilter, onMessageCallback) => {
      setIsLoading(true);
      setError(null);      
      isFirstChunkRef.current = true;

      const chatPayload = { 
        userMessage, 
        conversationId, 
        parentMessageId, 
        userId: email, 
        applicationId: appId,
        attributeFilter };

      try {
        await initializeWebSocket(onMessageCallback, chatPayload);
      } catch (err) {
        setError(errorMap.error['intermediate-err']);
        setIsLoading(false);        
      }
    },
    [issuer, appId, roleArn, region, email]
  );

  return { sendMessage, closeConnection, isLoading, isStreaming, error };
};

export default useChatStream;

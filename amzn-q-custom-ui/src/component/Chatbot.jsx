// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { Redo2Icon, Ellipsis, CornerLeftUp, WifiOff } from 'lucide-react';
import { Offline, Online } from "react-detect-offline";
import PropTypes from 'prop-types';
import defaultLogo from '../assets/amazonq.png';
import userAvatar from '../assets/user.png';
import Loader from './elements/Loader';
import Alert from './elements/Alert';
import ChatbotLoader from './elements/ChatbotLoader';
import Message from './elements/Message';
import ChatHistoryMenu from './elements/ChatHistoryMenu';
import CannedQuestions from './elements/CannedQuestions';
import useChatStream from './hooks/useChatStream';
import useMessages from './hooks/useMessages';
import { useGlobalConfig } from './providers/GlobalConfigContext';
import { insertSupTags } from './utils/citationHelper';
import { useTemplateUtils, defaultTemplate, template } from './hooks/useTemplateUtils';


const Chatbot = ({ 
  title, 
  subtitle, 
  inputPlaceholder,
  disclaimerText,
  feedbackEnabled=true,
  richSource=true,
  showInlineCitation=true,
  issuer,
  email,
  qBusinessAppId,
  awsRegion,
  iamRoleArn,  
  instructions=null,                                            //{"instructions": "...."}
  showHistory=false,
  showNewChatBtn=false,
  cannedQuestions=[],
  hideAvatars=false,
  attributeFilter=null,
  theme,
  mode='authenticated',  // 'authenticated' | 'anonymous'
  onChatMessage=null,
  onClose=null }) => {

    const globalStyles = {
        assistantIcon: theme?.assistantIcon || undefined,    //Default assistant icon react node
        userIcon: theme?.userIcon || undefined,              //Default user icon react node
        bgColor: theme?.bgColor || "",                       //Default background color, hex or rgb() string
        userMsgBgColor: theme?.userMsgBgColor || "",         //Default user message background, hex or rgb() string
        aiMsgBgColor: theme?.aiMsgBgColor || "",             //Default AI message background, hex or rgb() string      
        sendBtnColor: theme?.sendBtnColor || "",             //Default send button color, hex or rgb() string
        sendBtnIcon: theme?.sendBtnIcon || undefined,        //Default icon for send button react node
        inputBgColor: theme?.inputBgColor || "",             //Default input background color, hex or rgb() string
        inputTextColor: theme?.inputTextColor || "",         //Default input text color, hex or rgb() string            
    };
    const { updateConfig } = useGlobalConfig();

    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const [isAnimating, setIsAnimating] = useState(false);
    const [conversationID, setConversationID] = useState(null);
    const [parentMessageID, setParentMessageID] = useState(null);  
    const [retry, setRetry] = useState(false);

    const messagesEndRef = useRef(null);
    const textareaRef = useRef(null);

    const customTemplate = instructions ? (() => {
        try {
          // Wrap instructions in <system> tag
          return template`<system>${instructions}</system>`;
        } catch (err) {
          return defaultTemplate;
        }
      })() : defaultTemplate;
    const { applyTemplate } = useTemplateUtils(customTemplate);
    
    const { 
        sendMessage: send, 
        // closeConnection,  /** Amazon Q discards the message if streaming is stopped  */
        isLoading: streamLoading, 
        error: err, 
        isStreaming } = useChatStream({
                            issuer, 
                            region: awsRegion, 
                            email, 
                            roleArn: iamRoleArn, 
                            appId: qBusinessAppId,
                            mode});
    const {isLoadingMessages, 
        messageList, 
        messagesError, 
        resetMessages,
        getListMessages, 
        loadMoreMessages, 
        hasMoreMessages} = useMessages({
                            issuer, 
                            region: awsRegion, 
                            email, 
                            roleArn: iamRoleArn, 
                            appId: qBusinessAppId})

    const handleContextUpdate = useCallback(() => {
        updateConfig({
            showInlineCitation,
            issuer,
            email,
            qBusinessAppId,
            awsRegion,
            iamRoleArn,
            theme
        });
    }, [issuer, email, qBusinessAppId, awsRegion, iamRoleArn, theme, updateConfig]);
    
    useEffect(() => {
        handleContextUpdate();
    }, [ JSON.stringify(theme)])
    
    useEffect(() => {
        if(messageList && messageList.length > 0){
            const allMessages = [...messageList, ...messages];
            setMessages(allMessages)
            const lastMessage = allMessages[allMessages.length - 1];

            if (lastMessage.sender === 'USER') {
                setRetry(true);
            }

            const lastSystemMessage = [...allMessages].reverse().find((msg) => msg.sender === 'SYSTEM');
            if (lastSystemMessage) {
                setParentMessageID(lastSystemMessage.messageId);
            }        
        }        
    }, [messageList])
    
    useEffect(() => {
        if (isAnimating) {
            const timer = setTimeout(() => setIsAnimating(false), 300);
            return () => clearTimeout(timer);
        }
    }, [isAnimating]);

    useLayoutEffect(() => {
        requestAnimationFrame(() => {
            messagesEndRef.current?.scrollIntoView();
        });
    }, [messages]);

    const resetChat = useCallback(() => {
        resetMessages();
        setMessages([]); 
        setInputText('');   
        setConversationID(null);
        setParentMessageID(null);        
    }, [resetMessages]);

    const onConversationDel = useCallback((convoId) => {
        if(conversationID === convoId){
            resetChat();
        }
    }, [conversationID, resetChat]);

    const handleConvoSelect = useCallback(async(convo) => {
        setMessages([]);
        setConversationID(convo.conversationId);
        await getListMessages(convo.conversationId, instructions);
    }, [getListMessages, instructions]);

    const handleSendStreaming = useCallback((enteredText=null, retry=false) => {
        if (inputText.trim() || enteredText) { 
            if(!retry){
                const userMessage = { text: enteredText || inputText, sender: 'USER' };
                setMessages((prevMessages) => [...prevMessages, userMessage]);
            }            
            setInputText('');
            // const messageText = (instructions)? `${instructions["instructions"]} \n ${enteredText || inputText}`: `${alignment["instructions"]} \n ${enteredText || inputText}`;
            const messageText = applyTemplate(`${enteredText || inputText}`)
            send(messageText, conversationID, parentMessageID, attributeFilter, (eventType, data) => {
                if (eventType === 'textEvent') {
                    const newText = data;
                    setMessages((prevMessages) => {
                        const currentMessages = [...prevMessages];
                        if (
                            currentMessages.length > 0 &&
                            currentMessages[currentMessages.length - 1].sender === 'SYSTEM'
                        ) {
                            currentMessages[currentMessages.length - 1].text += newText;
                        } else {
                            currentMessages.push({ text: newText, sender: 'SYSTEM' });
                        }
                        return currentMessages;
                    });                 
                }
        
                if (eventType === 'metadataEvent') {
                    setConversationID(data.conversationId);
                    setParentMessageID(data.parentMessageID);
                    setMessages((prevMessages) => {
                        const currentMessages = [...prevMessages];
                        if (
                            currentMessages.length > 0 &&
                            currentMessages[currentMessages.length - 1].sender === 'SYSTEM'
                        ) {
                            if (showInlineCitation){
                                let text = currentMessages[currentMessages.length - 1].text;
                                text = insertSupTags(text, data.source);
                                currentMessages[currentMessages.length - 1]['text'] = text;
                            }
                            currentMessages[currentMessages.length - 1]['source'] = data.source;
                            currentMessages[currentMessages.length - 1]['conversationId'] = data.conversationId;
                            currentMessages[currentMessages.length - 1]['messageId'] = data.parentMessageID;
                        }
                        return currentMessages;
                    });
                }
            });
        }
    }, [inputText, conversationID, parentMessageID, attributeFilter, send, applyTemplate]);

    const handleQuestionClick = useCallback((question) => {        
        handleSendStreaming(question);
    }, [handleSendStreaming]);

    const handleSendMessage = useCallback(async(e) => {    
        handleSendStreaming();
    }, [handleSendStreaming]);

    /*
    The streaming cannot be stopped at the moment. 
    Partial system messages are not retained by Amazon Q.

    const handleStopStreaming = () => {
        closeConnection();
    };
    */

    const handleErrRetry = useCallback(async() => {
        const lastMsg = messages[messages.length - 1];
        const inputText = lastMsg["text"];
        handleSendStreaming(inputText, true);
        setRetry(false);
    }, [messages, handleSendStreaming]);

    const handleInputChange = (e) => {
        setInputText(e.target.value);
        adjustTextareaHeight();
    };

    const adjustTextareaHeight = useCallback(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = `${Math.min(textarea.scrollHeight, 3 * 24)}px`;
        }
    }, []);

    const handleKeyDown = (e) => {    
        if (streamLoading) return;
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    return (        
        <div className={`h-screen flex flex-col items-center justify-center overflow-hidden
                        min-h-0 flex-grow overflow-y-auto relative `} 
            style={{backgroundColor: globalStyles["bgColor"]}}>  
            <div className='xl:w-[60%] l:w-[60%] md:w-[70%] sm:w-[100%] xs:w-[100%] flex flex-col h-screen'>
                <div className="overflow-y-auto p-4 custom-scrollbar h-full w-full mt-8">
                    {
                        (isLoadingMessages && messages.length === 0) && 
                        <div className="flex flex-col items-center justify-center h-full text-gray-500">
                            <Loader size={36} className='text-zinc-400'/>
                            <div className='text-sm text-zinc-400'>Loading conversation...</div>
                        </div>
                    }
                    {
                        (hasMoreMessages && messages.length > 0) &&
                        <div className='flex mb-2 items-center justify-center'>
                            <button onClick={() => loadMoreMessages(conversationID, instructions)}
                                className="flex flex-row justify-center align-middle bg-white text-gray-500 py-1 px-2 rounded-full shadow hover:bg-gray-100 transition-colors duration-200">
                                    {
                                        isLoadingMessages?
                                        <Loader size={16} className='mr-1'/>
                                        :<Ellipsis size={16} className='mr-1'/>
                                    }
                                <div className='text-xs'>Load older messages</div>
                            </button>
                        </div>
                    }
                    {(messages.length === 0 && !isLoadingMessages) ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                <img src={globalStyles["assistantIcon"]? globalStyles["assistantIcon"]: defaultLogo} alt="AI assistant logo" className="w-24 h-24 mb-4" />
                                <div className="font-medium text-center xs:text-md sm:text-xl lg:text-xl xl:text-xl xxl:text-xl">
                                {
                                    title?
                                    title
                                    :"AI Assistant"
                                }
                                </div>
                                <div className="font-medium text-sm my-2 text-center">
                                {
                                    subtitle?
                                    subtitle
                                    :"An intelligent AI assistant that can answer your questions"
                                }
                                </div>
                                {
                                    (cannedQuestions) &&
                                    <Online>
                                        <CannedQuestions questions={cannedQuestions} onClick={handleQuestionClick}/>
                                    </Online>
                                }
                        </div>
                        ) : (
                        <>
                            {messages.map((msg, index) => (
                                <div key={index} className={`relative inline-block w-full px-3 py-5
                                                grid grid-cols-[auto,minmax(0,1fr)] gap-1
                                                ${msg.sender === 'USER' ? 'bg-[#fcfcfc]' : 'bg-[#F4F6FF]'}`} 
                                    style={{backgroundColor: msg.sender === 'USER' ? globalStyles["userMsgBgColor"] : globalStyles["aiMsgBgColor"] }}>
                                        {(msg.sender === 'SYSTEM' && !hideAvatars) && (
                                            <img src={globalStyles["assistantIcon"]? globalStyles["assistantIcon"]: defaultLogo} 
                                            alt="Assistant" className="w-8 h-8 rounded-full mr-2 flex-shrink-0" />
                                        )}       
                                        {(msg.sender === 'USER' && !hideAvatars) && (
                                            <img src={globalStyles["userIcon"]? globalStyles["userIcon"]: userAvatar} 
                                                alt="User" className="w-8 h-8 rounded-full mr-2 flex-shrink-0" />
                                        )} 
                                    <div className={`text-sm break-words overflow-hidden`}>
                                        <Message 
                                            conversationId={msg.conversationId}
                                            messageId={msg.messageId}
                                            text={msg.text} 
                                            user={msg.sender} 
                                            source={msg.source}  
                                            ts={msg.time}                                       
                                            feedbackEnabled={feedbackEnabled}
                                            isStreaming={isStreaming}
                                            richSource={richSource}
                                        />
                                    </div>                                    
                                </div>           
                            ))}   
                            {
                                (streamLoading) && 
                                <ChatbotLoader speed={1.5} color={theme?.["msgTextColor"]}/>
                            }
                            <div ref={messagesEndRef} />
                        </>
                    )}                    
                </div>                        
                {
                    (messagesError && !isLoadingMessages)&&
                    <div className='pl-4 pr-4'>
                        <Alert type='error' 
                                subTitle={"An error occured while trying load the conversation. Please retry."} 
                                floaty={true} autoDismiss={true} dismissTime={5000}/>
                    </div>
                }
                {
                    (err && conversationID) &&
                    <div className='pl-4 pr-4'>
                        <Alert type='warning' 
                                subTitle={err} 
                                floaty={false} autoDismiss={false} />
                    </div>
                }
                {/* Online only */}
                <Online>
                    <div className="pb-4 pl-4 pr-4 pt-0 rounded-xl"
                        style={{backgroundColor: globalStyles["bgColor"]}}>
                        {
                            retry ?
                            <div className='flex items-center justify-center'>
                                <button onClick={handleErrRetry}
                                    className="flex flex-row w-32 justify-center align-middle bg-white text-gray-500 py-2 px-4 rounded-full shadow hover:bg-gray-100 transition-colors duration-200">
                                <Redo2Icon size={22} className='mr-1'/>
                                <div className='text-[16px]'>Retry</div>
                                </button>
                            </div>
                            :<div className="shadow relative bg-blue-50 rounded-xl" style={{backgroundColor: globalStyles["inputBgColor"]}}>
                                <textarea
                                    id="chat-input"
                                    aria-label='chat-input'
                                    ref={textareaRef}
                                    value={inputText}
                                    disabled={isLoadingMessages || isStreaming || streamLoading}
                                    onChange={handleInputChange}
                                    onKeyDown={handleKeyDown}
                                    placeholder={(messages.length === 0)? (inputPlaceholder)? inputPlaceholder: "Ask a question..." : "Ask a follow-up question..."}
                                    className="w-full bg-transparent rounded-xl px-4 py-2 pr-12 focus:outline-none 
                                            resize-none overflow-y-auto amzn-q-chat-input-scroll"
                                    style={{ minHeight: '60px',
                                        maxHeight: '180px', 
                                        backgroundColor: globalStyles["inputBgColor"], 
                                        color: globalStyles["inputTextColor"]}}
                                    rows={1}
                                />
                                <button
                                    id="chat-send-button"
                                    aria-label='Send chat button'
                                    onClick={handleSendMessage}
                                    disabled={isLoadingMessages || isStreaming || streamLoading}
                                    className="send-button absolute right-2 top-2 py-2 px-2 rounded text-sm bg-indigo-500 text-white p-2 rounded-full hover:bg-indigo-700 transition-colors duration-200"
                                    style={{backgroundColor: globalStyles["sendBtnColor"]}}
                                >
                                {
                                    (isStreaming)?
                                    <Loader size={16}/>
                                    :(globalStyles["sendBtnIcon"])?
                                    globalStyles["sendBtnIcon"]
                                    : <CornerLeftUp size={16} strokeWidth={3}/>
                                }                
                                </button>
                            </div>
                        }
                        {
                            (showHistory || showNewChatBtn || onClose) &&
                            <ChatHistoryMenu                             
                                onSelectMessage={handleConvoSelect} 
                                onDelete={onConversationDel}                            
                                onNewChat={resetChat}
                                conversationId={conversationID}
                                showNewChatBtn={showNewChatBtn}
                                showMenuBtn={showHistory}
                                mode={mode}
                                onClose={() => console.log('close')}/>                        
                        }
                        <div className='text-xs mt-2 text-gray-400 w-full text-center'>
                        {
                            (disclaimerText)?
                            disclaimerText
                            : "This chatbot uses generative AI. Please verify responses for accuracy."
                        }            
                        </div>
                    </div>  
                </Online>        
                <Offline>
                    <div className="px-4 py-10 rounded-xl flex flex-row justify-center align-middle"
                            style={{backgroundColor: globalStyles["bgColor"]}}>
                        <WifiOff size={24} className='mr-4' style={{color: globalStyles["inputTextColor"]}}/>
                        <div className='text-lg' style={{color: globalStyles["inputTextColor"]}}>You seem offline.</div>
                    </div>
                </Offline>
            </div>   
        </div>         
    );
};

Chatbot.propTypes = {
    mode: PropTypes.oneOf(['authenticated', 'anonymous'])
};

export default Chatbot;
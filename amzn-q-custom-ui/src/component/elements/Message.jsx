// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import React, { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkSlug from 'remark-slug';
import rehypeRaw from 'rehype-raw';
import removeInstructionsPlugin from '../utils/removeSystemPrompt';
import {Prism as SyntaxHighlighter} from 'react-syntax-highlighter'
import {nightOwl} from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, ThumbsUp, ThumbsDown, Check } from 'lucide-react';

import SourceCarousel from './SourceCarousel';
import FeedbackModal from './FeedbackModal';
import CitationMarker from './CitationMarker';
import { useGlobalConfig } from '../providers/GlobalConfigContext';
import useChatFeedback from '../hooks/useChatFeedback';

  
const Message = ({
    conversationId,
    messageId,
    text, 
    user, 
    source,     
    feedbackEnabled, 
    richSource,
    isStreaming=false
}) => {

    const [copied, setCopied] = useState(false);
    const [codeCopied, setCodeCopied] = useState(false);
    const [liked, setLiked] = useState(false);
    const [disliked, setDisliked] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const { issuer, email, qBusinessAppId, awsRegion, iamRoleArn, theme, showInlineCitation  } = useGlobalConfig();
    const { putFeedback, error } = useChatFeedback({issuer, appId: qBusinessAppId, roleArn: iamRoleArn, region:awsRegion, email})

    
    const msgStyle = {
        msgTextColor: theme?.msgTextColor || "",             //Default text color, hex or rgb() string
        sourceBgColor: theme?.sourceBgColor || "",
        feedbackBgColor: theme?.feedbackBgColor || "",       //Default feedback background color, hex or rgb() string
        feedbackIconColor: theme?.feedbackIconColor || "",   //Default feedback icon color, hex or rgb() string
    }

    const handleCopytoClipboard = (text) => {
        let finalText = text;
        if (showInlineCitation){
            finalText = text.replace(/<sup\b[^>]*>/g, '[').replace(/<\/sup>/g, ']');;
        }

        if(source){
            const sourceString = source.map((it) => `[${it.citationNumber}] ${it.title} (${it.url})`).join('\n');
            finalText += "\n\nSources:\n"+sourceString;
        }

        navigator.clipboard.writeText(finalText).then(() => {
          setCopied(true);
          setTimeout(() => {
            setCopied(false);
          }, 1500);
        });
    };
    
    const handleLike = () => {
        setLiked(true);
        setTimeout(() => {
          setLiked(false);
        }, 1500);
        handleFeedbackSubmit({feedbackType: "HELPFUL", additionalDetails: ""},"USEFUL")
    }
    
    const handleDislike = () => {
        setIsModalOpen(true)
        setDisliked(true);
        setTimeout(() => {
          setDisliked(false);
        }, 1500);        
    }

    const handleFeedbackSubmit = (feedbackData, usefulness="NOT_USEFUL") => {
        putFeedback(conversationId, messageId, usefulness, feedbackData['feedbackType'], feedbackData["additionalDetails"])
    };

    const copyCodeToClipboard = (code) => {
        navigator.clipboard.writeText(code).then(() => {
            setCodeCopied(true);
            setTimeout(() => {
              setCodeCopied(false);
            }, 1500);
          });;        
    };

    return <div className='group'>                          
        <ReactMarkdown               
            className={`prose prose-md !max-w-none text-sm mt-0 mb-0 w-full prose-a:underline ${user === 'USER' ? 'text-xl' : ''}`}
            remarkPlugins={[remarkGfm, remarkSlug, removeInstructionsPlugin]}  
            rehypePlugins={[rehypeRaw]}              
            components={{
                code(props) {
                    const {children, className, node, ...rest} = props
                    const match = /language-(\w+)/.exec(className || '')
                    const language = match ? match[1] : 'unknown';
                    const codeString = String(children).replace(/\n$/, '');
                    return match ? (
                        <div className="relative bg-gray-900 rounded-md p-2 mb-4">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-xs text-gray-400 font-mono">
                                    {language}
                                </span>
                                <button
                                    onClick={() => copyCodeToClipboard(codeString)}
                                    className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded hover:bg-gray-600"
                                >
                                    {codeCopied ? 
                                        <Check className='text-gray-50 hover:text-white' size={12} /> 
                                        : <Copy className='text-gray-50 hover:text-white' size={12} />
                                    }
                                </button>
                            </div>
                            <SyntaxHighlighter
                                {...rest}
                                children={String(children).replace(/\n$/, '')}
                                language={match[1]}
                                style={nightOwl}
                                codeTagProps={{
                                    style: {
                                        whiteSpace: 'pre', // Prevent wrapping
                                        wordBreak: 'normal', // Avoid word breaks
                                        overflowWrap: 'normal'
                                    },
                                }}
                            />
                        </div>
                    ) : (
                        <code {...rest} className={className} style={{color: msgStyle["msgTextColor"]}}>
                            {children}
                        </code>
                    )
                },
                sup({ node, children, ...props }) {       
                    if(user === 'SYSTEM'){
                        const citationNumber = children[0];
                        const endOffset = props['data-endoffset'];                    
                        const citationSource = source.filter((it) => it.citationNumber === parseInt(citationNumber))[0];
                        let offsetSource;
                        if(citationSource.citationMarkers){
                            offsetSource = citationSource.citationMarkers.filter((it) => it.endOffset === parseInt(endOffset))[0];
                        }
                        return <CitationMarker number={citationNumber} source={{url: citationSource.url, title: citationSource.title}} snippet={offsetSource?.snippet} {...props} />;
                    }else{
                        return null;
                    }
                },
                pre: ({ children, ...props }) => <>{children}</>,
                h1: ({node, ...props}) => <h1 className={`text-base font-bold mt-0 mb-0`} style={{color: msgStyle["msgTextColor"]}} {...props} />,
                h2: ({node, ...props}) => <h2 className={`text-base font-bold mt-0 mb-0`} style={{color: msgStyle["msgTextColor"]}} {...props} />,
                h3: ({node, ...props}) => <h3 className={`text-base font-bold mt-0 mb-0`} style={{color: msgStyle["msgTextColor"]}} {...props} />,
                h4: ({node, ...props}) => <h4 className={`text-base font-bold mt-0 mb-0`} style={{color: msgStyle["msgTextColor"]}} {...props} />,
                strong: ({node, ...props}) => <strong className={`mt-0 mb-0`} style={{color: msgStyle["msgTextColor"]}} {...props} />,                    
                th: ({node, ...props}) => <th style={{color: msgStyle["msgTextColor"]}} {...props} />,
                td: ({node, ...props}) => <td style={{color: msgStyle["msgTextColor"]}} {...props} />,
                p: ({node, ...props}) => <p style={{color: msgStyle["msgTextColor"]}} {...props} />,
                ul: ({node, ...props}) => <ul className={`list-disc space-y-4`} style={{color: msgStyle["msgTextColor"]}} {...props} />,
                ol: ({node, ...props}) => <ol className={`list-decimal space-y-4`} style={{color: msgStyle["msgTextColor"]}} {...props} />,
                li: ({node, ...props}) => <li className={`mt-0 mb-0 leading-tight`} style={{color: msgStyle["msgTextColor"]}} {...props} />,
                hr: ({node, ...props}) => <p className={`mt-0 mb-0 border-t border-blue-500 my-4`} {...props} />,
                a: ({node, ...props}) => <a className={`text-blue-600 hover:text-blue-800`} style={{color: msgStyle["msgTextColor"]}} {...props} />,
            }}
            >              
            {text}              
        </ReactMarkdown>
        {
            (user === 'SYSTEM' && source && source.length > 0 && richSource)&&
            <SourceCarousel sources={source}/>
        }  
        {
            (user === 'SYSTEM' && source && source.length > 0 && !richSource)&&
            <div className='flex flex-col mt-2 mb-3 pt-2 pb-2 pl-2 pr-2 text-xs bg-blue-gray-100 rounded'
                style={{backgroundColor: msgStyle["sourceBgColor"]}}>
                <strong className='text-md' style={{color: msgStyle["msgTextColor"]}}>Sources</strong>
                {
                    source.map((src, idx) =>  {
                    return <a href={src.url} target="_blank" className="underline hover:text-blue-600"
                                style={{color: msgStyle["msgTextColor"]}}
                                key={`src-${src.title}-${idx}`} to={src.url} >
                                {`[${idx+1}] `}{src.title}
                            </a>
                                                            
                    })
                }
            </div>
        }       
        {
            (user === 'SYSTEM' && !isStreaming) &&
            <div className='absolute bottom-2 right-3 flex flex-row space-x-1 rounded-md justify-end bg-indigo-500'
                style={{backgroundColor: msgStyle["feedbackBgColor"]}}>
                {
                    feedbackEnabled &&
                    <>
                        <button className='hover:bg-indigo-600 p-1 rounded' onClick={handleLike}>
                            {
                            liked ? 
                            <Check className='text-gray-50 hover:text-white' size={14} />                     
                            : <ThumbsUp className='text-gray-50 hover:text-white' size={14}/>
                            }
                        </button>
                        <button className='hover:bg-indigo-600 p-1 rounded' onClick={handleDislike}>
                            {
                            disliked?
                            <Check className='text-gray-50 hover:text-white' size={14} />                     
                            :<ThumbsDown className='text-gray-50 hover:text-white' size={14}/>
                            }                  
                        </button>
                    </>
                }                
                <button className='hover:bg-indigo-600 p-1 rounded' onClick={() => handleCopytoClipboard(text)}>
                    {copied ? 
                        <Check className='text-gray-50 hover:text-white' size={14} /> 
                    : <Copy className='text-gray-50 hover:text-white' size={14} />}
                </button>
                <FeedbackModal 
                    isOpen={isModalOpen} 
                    onClose={() => setIsModalOpen(false)} 
                    onSubmit={handleFeedbackSubmit}
                />
            </div>
        }
    </div>
}

export default Message;
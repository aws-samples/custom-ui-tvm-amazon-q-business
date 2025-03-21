// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import React, { useState, useMemo } from 'react';
import { Menu, Trash, ChevronLeft, EditIcon, X } from 'lucide-react';
import useListConversations from '../hooks/useListConversations';
import useDeleteConversation from '../hooks/useDeleteConversation';
import useBreakpoint from '../hooks/useBreakpoint';
import { useGlobalConfig } from '../providers/GlobalConfigContext';
import { formatDate, formatTime } from '../utils/dateConverter';
import Loader from './Loader';
import Alert from './Alert';

const groupByDate = (conversations) => {
  return conversations.reduce((acc, message) => {
    const date = formatDate(message.startTime);
    if (!acc[date]) acc[date] = [];
    acc[date].push(message);
    return acc;
  }, {});
};

const removeInstructionsFromPlainText = (text) => {
  const instructionsRegex = /<system>[\s\S]*?<\/system>/g;
  return text.replace(instructionsRegex, '').trim();
};

// Chat History menu functionality for authenticated mode
const AuthenticatedMenuContent = ({ 
  onSelectMessage, 
  onDelete, 
  onNewChat, 
  conversationId, 
  showNewChatBtn,
  onClose,
  isOpen,
  setIsOpen,
  theme 
}) => {
  const [convToDel, setConvToDel] = useState(null);
  const [selectedConvoId, setSelectedConvoId] = useState(null);
  const breakpoint = useBreakpoint('(min-width: 768px)');

  const { 
    issuer,
    email,
    qBusinessAppId,
    awsRegion,
    iamRoleArn,
  } = useGlobalConfig();

  const {
    isLoading, 
    conversations, 
    refreshListConversations,
    loadMoreConversations, 
    error, 
    hasMore
  } = useListConversations({
    issuer, 
    appId: qBusinessAppId, 
    roleArn: iamRoleArn, 
    region: awsRegion, 
    email
  });

  const { 
    delConversation, 
    delLoading, 
    delError
  } = useDeleteConversation({
    issuer, 
    appId: qBusinessAppId, 
    roleArn: iamRoleArn, 
    region: awsRegion, 
    email
  });

  const groupedConversations = useMemo(() => groupByDate([...conversations]), [[...conversations]]);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
    refreshListConversations();
  };

  const styling = {
    menuColor: theme?.aiMsgBgColor || "",
    menuItemHoverColor: theme?.bgColor || "",
    bgColor: theme?.bgColor || "#fff",
    btnColor: theme?.bgColor || "",
    textColor: theme?.msgTextColor || ""
  };

  const deleteConversation = async(conversationId) => {
    setConvToDel(conversationId);
    await delConversation(conversationId);
    await refreshListConversations();
    setConvToDel(null);
    if(onDelete) {
      onDelete(conversationId);
    }    
  };

  const selectConversation = (message) => {
    if(selectedConvoId !== message.conversationId) {
      setSelectedConvoId(message.conversationId);
      if(onSelectMessage) {
        onSelectMessage(message);
      }
    }
    if(!breakpoint) {
      setIsOpen(!isOpen);
    }
  };

  return (
    <>
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-20 z-40"
          onClick={toggleMenu}          
        />
      )}

      <div className={`fixed top-0 left-0 h-full bg-white shadow-lg 
                    transition-transform duration-300 ease-in-out
                    border-r-1 border-gray-100 
                    xs:w-full md:w-1/3 sm:w-1/4 xs:w-1/2 lg:1/4 xl:w-80 z-50 pb-8 ${
                      isOpen ? 'translate-x-0' : '-translate-x-full'
                    }`}
        style={{backgroundColor: styling["menuColor"]}}>
        <div className="p-4 flex justify-between items-center">
          <h2 className="text-lg font-bold" style={{color: styling["textColor"]}}>Conversations</h2>            
          <div className='flex space-x-2'>
            {showNewChatBtn && (
              <button 
                aria-label='Start new chat button'
                name='start-new-chat-button'
                onClick={onNewChat}
                className="p-2 rounded-md bg-gray-300 transition-all duration-300 w-8 h-8 opacity-70 hover:opacity-100"
                style={{backgroundColor: styling["btnColor"]}}>
                <EditIcon size={24} className='w-4 h-4' style={{color: styling["textColor"]}}/>
              </button>  
            )}
            <button
              aria-label='Chat History Menu Button'
              name='chat-history-menu'
              onClick={toggleMenu}
              className="p-2 rounded-md bg-gray-300 transition-all duration-300 w-8 h-8 opacity-70 hover:opacity-100"
              style={{backgroundColor: styling["btnColor"], color: styling["textColor"]}}
            >
              <ChevronLeft size={24} className='w-4 h-4'/>
            </button>
          </div>
        </div>

        {error && (
          <div className='pl-4 pr-4'>
            <Alert 
              type='error' 
              subTitle="An error occurred while trying to load conversations."
              floaty={false} 
              autoDismiss={false}
            />
          </div>
        )}

        {delError && (
          <div className='pl-4 pr-4'>
            <Alert 
              type='error' 
              subTitle="An error occurred while trying to delete the conversation. Please retry."
              floaty={true} 
              autoDismiss={true} 
              dismissTime={5000}
            />
          </div>
        )}

        <div className="p-0 h-full overflow-y-auto scroll-smooth pb-20 custom-scrollbar">
          <ul>
            {conversations && conversations.length > 0 ? (
              Object.keys(groupedConversations).map((date) => (
                <React.Fragment key={date}>
                  <li className="text-lg font-bold text-zinc-500 px-2 py-1 text-lg mx-2 mt-4 border-b mb-2">
                    {date}
                  </li>
                  {groupedConversations[date].map((message) => {
                    let title = removeInstructionsFromPlainText(message.title);
                    return (
                      <li
                        key={message.conversationId}
                        className='group rounded-lg pl-2 pr-2 py-1 mx-2 mb-1 cursor-pointer hover-bg-menu-item grid grid-cols-[minmax(0,1fr),auto] gap-1 items-center'
                        style={{
                          borderRight: conversationId === message.conversationId ? '4px solid rgb(14 165 233)' : 'none',
                          borderRadius: conversationId === message.conversationId ? '0px': '',
                          borderTopLeftRadius: conversationId === message.conversationId ? '10px': '',
                          borderBottomLeftRadius: conversationId === message.conversationId ? '10px': '',
                          backgroundColor: conversationId === message.conversationId ? 'rgba(0,0,0,0.1)': '',
                        }}
                      >
                        <div onClick={() => selectConversation(message)}>
                          <p className="text-sm truncate" style={{ color: styling["textColor"] }}>
                            {title}
                          </p>
                          <p className="text-xs text-gray-500 opacity-50" style={{ color: styling["textColor"] }}>
                            {formatTime(message.startTime)}
                          </p>
                        </div>
                        <button
                          onClick={() => deleteConversation(message.conversationId)}
                          disabled={delLoading}
                          style={{ float: 'right', opacity: delLoading && message.conversationId === convToDel ? '100':''}}
                          className="bg-white text-gray-500 rounded-sm shadow bg-gray-200 py-1 px-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300"                        
                        >
                          {delLoading && message.conversationId === convToDel 
                            ? <Loader size={12}/>
                            : <Trash size={12} />
                          }
                        </button>
                      </li>
                    );
                  })}
                </React.Fragment>
              ))
            ) : (
              <li className="text-center text-gray-500 py-4 text-sm">
                {isLoading && conversations.length === 0 ? <Loader /> : <i>No conversations yet</i>}
              </li>
            )}
          </ul>
          {hasMore && (
            <div className='p-4'>
              <button 
                className="bg-white text-gray-500 py-2 px-4 rounded-full shadow hover:bg-gray-100 transition-colors duration-200 text-sm w-full"
                disabled={isLoading || delLoading}
                onClick={loadMoreConversations}
              >
                {isLoading ? <Loader size={18}/> : 'Load more conversations'}                
              </button>
            </div>
          )}
        </div>        
      </div>
    </>
  );
};

const ChatHistoryMenu = ({ 
  onSelectMessage, 
  onDelete, 
  onNewChat, 
  conversationId, 
  showNewChatBtn = false, 
  showMenuBtn = false, 
  onClose,
  mode = 'authenticated'
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const { 
    theme
  } = useGlobalConfig();
  
  const styling = {
    bgColor: theme?.bgColor || "#fff",
    btnColor: theme?.bgColor || "",
    textColor: theme?.msgTextColor || ""
  };

//   const styling = {
//     menuColor: theme?.aiMsgBgColor || "",
//     menuItemHoverColor: theme?.bgColor || "",
//     bgColor: theme?.bgColor || "#fff",
//     btnColor: theme?.bgColor || "",
//     textColor: theme?.msgTextColor || ""
//   }

  // Only show the top bar if any button needs to be shown
  const shouldShowTopBar = showNewChatBtn || (showMenuBtn && mode === 'authenticated') || onClose;

  if (!shouldShowTopBar) {
    return null;
  }

  return (
    <>
      {!isOpen && (
        <div className="flex items-center justify-between fixed top-0 left-0 right-0 z-50" 
             style={{backgroundColor: styling["bgColor"]}}>
          <div className="flex space-x-2 ml-4 p-2">
            {(showMenuBtn && mode === 'authenticated') && (
              <button
                aria-label="Chat History Menu Button Collapsed"
                name="chat-history-menu-collapsed"
                onClick={() => setIsOpen(true)}
                className="p-2 rounded-md bg-gray-300 w-8 h-8 transition-all duration-300 opacity-70 hover:opacity-100"
                style={{ backgroundColor: styling["btnColor"] }}
              >
                <Menu size={24} className="w-4 h-4" style={{ color: styling["textColor"] }} />
              </button>
            )}
            {showNewChatBtn && (
              <button
                aria-label="New Chat button Collapsed"
                name="new-chat-button-collapsed"
                onClick={onNewChat}
                className="p-2 rounded-md bg-gray-300 w-8 h-8 transition-all duration-300 opacity-70 hover:opacity-100"
                style={{ backgroundColor: styling["btnColor"] }}
              >
                <EditIcon size={24} className="w-4 h-4" style={{ color: styling["textColor"] }} />
              </button>
            )}
          </div>
          
          {onClose && (
            <button
              aria-label="Close Chat"
              name="close-chat-button"
              onClick={onClose}
              className="p-2 rounded-md bg-gray-300 w-8 h-8 transition-all duration-300 opacity-70 hover:opacity-100 mr-4"
              style={{ backgroundColor: styling["btnColor"] }}
            >
              <X size={24} className="w-4 h-4" style={{ color: styling["textColor"] }} />
            </button>
          )}
        </div>
      )}

      {/* Only render the menu content if mode is authenticated and showMenuBtn is true */}
      {showMenuBtn && mode === 'authenticated' && (
        <AuthenticatedMenuContent
          onSelectMessage={onSelectMessage}
          onDelete={onDelete}
          onNewChat={onNewChat}
          conversationId={conversationId}
          showNewChatBtn={showNewChatBtn}
          onClose={onClose}
          isOpen={isOpen}
          setIsOpen={setIsOpen}
          theme={theme}
        />
      )}
    </>
  );
};

export default ChatHistoryMenu;
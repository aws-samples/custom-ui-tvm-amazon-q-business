// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import React from 'react';
import Chatbot from './Chatbot';
import { CornerLeftUp } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GlobalConfigProvider } from './providers/GlobalConfigContext';

import "./index.css";

/**
 * @typedef {Object} QUIProps
 * @property {string} title - The title displayed in new/empty chat UI.
 * @property {string} [subtitle] - An optional subtitle displayed in the new/empty chat UI.
 * @property {string} [inputPlaceholder] - Placeholder text for the input field.
 * @property {string} [disclaimerText] - Disclaimer text shown in the UI.
 * @property {boolean} [feedbackEnabled=true] - Whether user feedback is enabled for AI messages.
 * @property {boolean} [richSource=true] - Whether to display rich Source attributions or simple.
 * @property {boolean} [shoInlineCitation=true] - Whether to display inline citation markers.
 * @property {string} issuer - The OIDC issuer URL.
 * @property {string} email - The email address for user identification.
 * @property {string} qBusinessAppId - The QBiz application ID.
 * @property {string} awsRegion - The AWS region for resources.
 * @property {string} iamRoleArn - The IAM Role ARN used for authentication.
 * @property {Object} [instructions] - Object containing instructions (e.g., `{ "instructions": "..." }`).
 * @property {boolean} [showHistory=false] - Whether to show the conversation history.
 * @property {boolean} [showNewChatBtn=false] - Whether to show the new chat button.
 * @property {Array<string>} [cannedQuestions=[]] - List of predefined questions for quick access.
 * @property {boolean} [hideAvatars=false] - Whether to hide user/assistant avatars.
 * @property {Object|null} [attributeFilter=null] - Optional filter for attributes.
 * @property {Object} [theme] - The theme configuration object for the UI.
 * @property {string} [mode] - The Amazon Q Business application mode authenticated or anonymous.
 * @property {function(Object): void} onChatMessage - Callback function when a message is received from Q Business.
 * @property {function(): void} onClose - Callback function when the chat panel is closed.

 */

/**
 * Amazon Q Custom UI Component - QUI.
 * 
 * @param {QUIProps} props - Props for the QUI component.
 * @returns {JSX.Element} The rendered component.
 */

const queryClient = new QueryClient();

const Qui = (props) => {
  return (
    <QueryClientProvider client={queryClient}>
        <GlobalConfigProvider>
            <Chatbot {...props}/>
        </GlobalConfigProvider>
    </QueryClientProvider>
  )
}

export default Qui;

export const solarizedTheme = {
  bgColor: "#1E1E1E",                 // Dark gray background
  userMsgBgColor: "#2C2C2C",          // Darker gray for user message background
  aiMsgBgColor: "#3A3A3A",            // Slightly lighter gray for AI message background
  sendBtnColor: "#fff",               // Blue for the send button
  sendBtnIcon: <CornerLeftUp size={16} className='text-black' strokeWidth={3}/>,
  inputBgColor: "#2C2C2C",            // Same as user message background for input background
  inputTextColor: "#fff",             // Light gray for input text color (easy readability)
  msgTextColor: "#fff",
  feedbackBgColor: "#2C2C2C",
  sourceBgColor: "#2C2C2C"
}

export const nighthawkTheme = {
  bgColor: "#2f2f2c",
  userMsgBgColor: "#1a1915",       // Darker gray for user message background
  aiMsgBgColor: "#393937bf",       // Slightly lighter gray for AI message background
  sendBtnColor: "#fff",            // Blue for the send button
  sendBtnIcon: <CornerLeftUp size={16} className='text-black' strokeWidth={3}/>,
  inputBgColor: "#393937bf",       // Same as user message background for input background
  inputTextColor: "#fff",          // Light gray for input text color (easy readability)
  msgTextColor: "#fff",
  feedbackBgColor: "#2C2C2C",
  sourceBgColor: "#2C2C2C"
}

export const forestTheme = {
  bgColor: "#0D1117",                 // Dark blue-black background
  userMsgBgColor: "#161B22",          // Slightly darker blue-black for user message background
  aiMsgBgColor: "#1F2933",            // Cool, dark bluish-gray for AI messages
  sendBtnColor: "#3B82F6",            // Bright blue send button for visual pop
  sendBtnIcon: <CornerLeftUp size={16} className='text-white text-bold'strokeWidth={3}/>,
  inputBgColor: "#161B22",            // Same as user message background for input field
  inputTextColor: "#E2E8F0",          // Light grayish-blue for input text
  msgTextColor: "#E5E7EB",            // Subtle off-white for message text (clear but soft on the eyes)
  feedbackBgColor: "#1A1F25",         // Darker blue-gray for feedback sections
  sourceBgColor: "#161B22",           // Matches AI message background for consistency
};

export const enterpriseLightTheme = {
  bgColor: "#F9FAFB",               // Very light gray background
  userMsgBgColor: "#E5E7EB",         // Light gray for user message background
  aiMsgBgColor: "#E8F1FA",           // Cool, pale blue for AI messages
  sendBtnColor: "#2563EB",           // Professional blue for the send button
  sendBtnIcon: <CornerLeftUp size={16} className='text-white' strokeWidth={3}/>,
  inputBgColor: "#FFFFFF",           // Pure white for input field background
  inputTextColor: "#374151",         // Dark gray for input text (easy readability)
  msgTextColor: "#1F2937",           // Almost black for message text
  feedbackBgColor: null,             // Light gray feedback background
  sourceBgColor: "#F3F4F6",          // Warm, soft gray for source blocks
};

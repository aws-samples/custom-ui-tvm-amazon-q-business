// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { useState, useEffect, useRef } from 'react';
import { Palette } from 'lucide-react';
import Qui, {solarizedTheme, nighthawkTheme, forestTheme, enterpriseLightTheme} from './component';


function App() {

  const Title = () => <div>AI Assistant powered by Amazon Q Business</div>;
  const SubTitle = () => <div>Get answer to your questions from across enterprise applications</div>;
  const Disclaimer = () => <div>This chatbot uses generative AI. Please verify responses for accuracy.</div>;
  
  const dropdownRef = useRef(null);
  const [theme, setTheme] = useState(forestTheme);
  const [isOpen, setIsOpen] = useState(false);

  const themes = [
    { name: 'Default', value: null},
    { name: 'Solarized', value: solarizedTheme },
    { name: 'Nighthawk', value: nighthawkTheme },
    { name: 'Forest', value: forestTheme },
    { name: 'Enterprise', value: enterpriseLightTheme}
  ];

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const ThemeSelector = () => {
    return (
      <div className="absolute bottom-4 right-4 z-50" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center bg-transparent border border-gray-300 px-2 py-1 text-sm rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <Palette className="w-5 h-5 text-gray-400 mr-2" />
          <span style={{color: (theme)? theme.msgTextColor : 'black'}}>Theme</span>
        </button>
        {isOpen && (
          <div className="absolute right-0 bottom-full w-32 bg-white border border-gray-300 rounded-md shadow-lg">
            {themes.map((themeOption) => (
              <button
                key={themeOption.name}
                className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-xs"
                onClick={() => {
                  setTheme(themeOption.value);                  
                  setIsOpen(false); // Close dropdown after selection
                }}
              >
                {themeOption.name}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full h-screen relative">
        <ThemeSelector/>
        <Qui 
            title={<Title/>} 
            subtitle={<SubTitle/>} 
            disclaimerText={<Disclaimer/>} 
            feedbackEnabled={true}
            richSource={true}            
            theme={theme}
            qBusinessAppId={import.meta.env.VITE_QBIZ_APP_ID}
            iamRoleArn={import.meta.env.VITE_IAM_ROLE_ARN}
            email={import.meta.env.VITE_EMAIL}
            awsRegion={import.meta.env.VITE_AWS_REGION}
            issuer={import.meta.env.VITE_ISSUER}
            inputPlaceholder={"Ask me anything..."}
            showHistory={true}
            showNewChatBtn={true}
            hideAvatars={false}
            mode='anonymous'
            cannedQuestions={[
              "What is Coffee-as-a-Service?",
              "What are the pricing plans available for CaaS?", 
              "What APIs are available in CaaS?",
              "Give me sample Python Code snippet on how to use Coffee-Menu API."]}            
        />              
    </div>
  )
}

export default App

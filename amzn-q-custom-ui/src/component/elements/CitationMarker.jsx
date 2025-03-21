// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Globe } from 'lucide-react';
import { useGlobalConfig } from '../providers/GlobalConfigContext';
import useBreakpoint from '../hooks/useBreakpoint';


const CitationMarker = ({ number, source = null, snippet = null, ...rest }) => {
  const [isHovered, setIsHovered] = useState(false);
  const markerRef = useRef(null); 
  const tooltipRef = useRef(null);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  let hideTimeout = useRef(null);

  const { theme } = useGlobalConfig();

  /**
   * if breakpoint is false that means its mobile (small screens)
   * and dismissing menu on conversation select is required to 
   * remove the menu out of the way.
   */
  const breakpoint = useBreakpoint('(min-width: 768px)'); 

  useEffect(() => {
    if (isHovered && markerRef.current) {
      const rect = markerRef.current.getBoundingClientRect();
      setTooltipPosition({
        top: rect.top - 10, // Slightly above the marker
        left: rect.left + rect.width / 2, // Centered horizontally
      });
    }
  }, [isHovered]);

  const handleMouseEnter = () => {
    clearTimeout(hideTimeout.current); // Cancel hide if the mouse re-enters
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    hideTimeout.current = setTimeout(() => setIsHovered(false), 200); // Add delay to hiding
  };

  const navigate = () => {
    if(source){
      window.open(source?.url, '_blank')
    }
  }

  return (
    <>
      {/* Marker Display */}
      <span
        ref={markerRef}
        className="inline-flex items-center justify-center align-middle mr-1 
                   min-w-[16px] h-[16px] rounded-sm text-gray-800 shadow-md
                   text-[10px] cursor-pointer"
        style={{backgroundColor: `${theme["userMsgBgColor"]|| '#fcfcfc'}`, color: theme["msgTextColor"]}}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={() => navigate()}
      >
        {number}
      </span>

      {(isHovered && breakpoint && source) &&
        createPortal(
          <div
            ref={tooltipRef}
            className="fixed z-50 w-64 p-2 bg-white shadow-lg rounded-md border border-gray-200"            
            style={{
              top: `${tooltipPosition.top}px`,
              left: `${tooltipPosition.left}px`,
              transform: 'translate(-50%, -100%)'              
            }}
            onMouseEnter={handleMouseEnter} // Keep tooltip open if hovered
            onMouseLeave={handleMouseLeave} // Allow hiding with a delay
          >
            <div className='flex items-start mb-2'>
              <Globe size={18} className='mr-2' />
              <h3 className="font-semibold text-sm text-gray-900">
                {source?.title}
              </h3> 
            </div>                       
            <p className="text-xs text-gray-700">{snippet}</p>
            <p className="text-xs text-gray-600 mt-2 truncate">
              <a
                href={source?.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                {source?.url}
              </a>
            </p>
          </div>,
          document.body // Render the tooltip outside parent containers
        )}
    </>
  );
};

export default CitationMarker;
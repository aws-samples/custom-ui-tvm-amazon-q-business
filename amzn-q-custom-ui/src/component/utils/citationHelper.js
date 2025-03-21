// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

export const insertSupTags = (text, sources) => {
  // Helper function to find the next word boundary
  const findWordBoundary = (text, position) => {
      // If we're already at a word boundary (space or punctuation), return current position
      if (/[\s.,!?;:]/.test(text[position])) {
          return position;
      }

      // Look ahead for the next word boundary
      let nextBoundary = position;
      while (nextBoundary < text.length && !/[\s.,!?;:]/.test(text[nextBoundary])) {
          nextBoundary++;
      }

      return nextBoundary;
  };

  // Collect all insertions
  const insertions = [];
  for (const source of sources) {
      const offsets = source.citationMarkers;
      const citationNumber = source.citationNumber;

      for (const { endOffset } of offsets) {
          // Find the appropriate word boundary for this citation
          const adjustedPosition = findWordBoundary(text, endOffset);
          insertions.push({ 
              position: adjustedPosition,
              originalOffset: endOffset,
              citationNumber 
          });
      }
  }

  // Group insertions by adjusted position
  const groupedInsertions = insertions.reduce((acc, { position, originalOffset, citationNumber }) => {
      if (!acc[position]) acc[position] = [];
      acc[position].push({ citationNumber, originalOffset });
      return acc;
  }, {});

  // Sort positions in descending order to maintain correct indices while inserting
  const sortedPositions = Object.keys(groupedInsertions).sort((a, b) => b - a);

  // Insert citations at word boundaries
  for (const position of sortedPositions) {
      const citations = groupedInsertions[position];
      const supTags = citations
          .map(({ citationNumber, originalOffset }) => 
              `<sup data-endoffset="${originalOffset}">${citationNumber}</sup>`
          )
          .join('');

      // Insert after the word if not at punctuation
      const insertPosition = parseInt(position);
      const isAtPunctuation = /[.,!?;:]/.test(text[insertPosition]);
      const spaceBefore = isAtPunctuation ? '' : ' ';
      const spaceAfter = isAtPunctuation ? ' ' : '';

      text = `${text.slice(0, insertPosition)}${spaceBefore}${supTags}${spaceAfter}${text.slice(insertPosition)}`;
  }

  return text;
};
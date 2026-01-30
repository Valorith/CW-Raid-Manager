const fs = require('fs');
const path = require('path');

// Simple PDF form fields extraction script
// Since pdf-parse is still installing, let's try a basic approach first

const pdfPath = '/home/ubuntu/projects/vayle-kanban/server/uploads/224d9a8d-030d-4d30-b67e-151fb9c821a4.pdf';

try {
  const pdfBuffer = fs.readFileSync(pdfPath);
  
  // Convert buffer to string to search for field names
  const pdfText = pdfBuffer.toString('binary');
  
  // Look for common PDF form field patterns
  const fieldPatterns = [
    /\/T\s*\([^)]+\)/g,  // Field names in PDF
    /\/V\s*\([^)]+\)/g,  // Field values
    /\/TU\s*\([^)]+\)/g, // Field tooltips
    /\/Ff\s*\d+/g,       // Field flags
  ];
  
  console.log('PDF Analysis Results:');
  console.log('====================');
  
  fieldPatterns.forEach((pattern, index) => {
    const matches = pdfText.match(pattern);
    if (matches && matches.length > 0) {
      console.log(`\nPattern ${index + 1} matches:`);
      matches.slice(0, 10).forEach(match => {
        console.log('  -', match);
      });
      if (matches.length > 10) {
        console.log(`  ... and ${matches.length - 10} more`);
      }
    }
  });
  
  // Also try to find any text that looks like field names
  const textFields = pdfText.match(/[A-Z][A-Za-z\s]{3,20}:/g);
  if (textFields) {
    console.log('\nPossible field labels:');
    [...new Set(textFields)].slice(0, 15).forEach(field => {
      console.log('  -', field);
    });
  }
  
} catch (error) {
  console.error('Error reading PDF:', error.message);
}
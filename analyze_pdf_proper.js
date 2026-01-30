const fs = require('fs');
const { PDFParse } = require('pdf-parse');

const pdfPath = '/home/ubuntu/projects/vayle-kanban/server/uploads/224d9a8d-030d-4d30-b67e-151fb9c821a4.pdf';

async function analyzePDF() {
  try {
    const dataBuffer = fs.readFileSync(pdfPath);
    
    console.log('Analyzing FITREP PDF...');
    console.log('========================');
    
    // Extract text content
    const parser = new PDFParse();
    const data = await parser.parse(dataBuffer);
    
    console.log(`Number of pages: ${data.numpages}`);
    console.log(`Total text length: ${data.text.length}`);
    console.log('\nExtracted text:');
    console.log('-'.repeat(50));
    console.log(data.text);
    console.log('-'.repeat(50));
    
    // Try to identify form fields
    const lines = data.text.split('\n').filter(line => line.trim().length > 0);
    console.log('\nParsed lines:');
    lines.forEach((line, index) => {
      if (index < 30) { // Show first 30 lines
        console.log(`${index + 1}. ${line.trim()}`);
      }
    });
    
    if (lines.length > 30) {
      console.log(`... and ${lines.length - 30} more lines`);
    }
    
    // Look for field patterns
    const fieldPatterns = [
      /Name[\s:]+/i,
      /Rank[\s:]+/i,
      /Date[\s:]+/i,
      /Period[\s:]+/i,
      /Rating[\s:]+/i,
      /Performance[\s:]+/i,
      /Comments[\s:]+/i,
      /Signature[\s:]+/i,
      /Evaluation[\s:]+/i,
      /Assessment[\s:]+/i
    ];
    
    console.log('\nIdentified potential fields:');
    fieldPatterns.forEach(pattern => {
      const matches = data.text.match(pattern);
      if (matches) {
        console.log(`Found pattern: ${pattern.toString()} - "${matches[0]}"`);
      }
    });
    
  } catch (error) {
    console.error('Error analyzing PDF:', error);
  }
}

analyzePDF();
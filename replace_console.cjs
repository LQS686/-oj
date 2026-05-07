const fs = require('fs');
const path = require('path');

function replaceConsoleCalls(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    const originalContent = content;

    // Check if logger import exists, if not add it
    if (!content.includes("from '@/lib/logger'")) {
      const importMatch = content.match(/(import\s+.*\s+from\s+'@\/lib\/[\w-]+')/);
      if (importMatch) {
        content = content.replace(importMatch[1], importMatch[1] + "\nimport { logger } from '@/lib/logger'");
      }
    }

    // Replace console.* calls
    content = content.replace(/console\.log\(/g, 'logger.info(');
    content = content.replace(/console\.error\(/g, 'logger.error(');
    content = content.replace(/console\.warn\(/g, 'logger.warn(');
    content = content.replace(/console\.info\(/g, 'logger.info(');
    content = content.replace(/console\.debug\(/g, 'logger.debug(');

    // Handle .catch(console.error) patterns
    content = content.replace(/\.catch\(console\.error\)/g, '.catch((err) => logger.error("Error", err))');

    // Write back if changed
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf-8');
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Error processing ${filePath}: ${error.message}`);
    return false;
  }
}

function processDirectory(basePath) {
  const files = [];

  function walkDir(dir) {
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          if (!fullPath.includes('node_modules')) {
            walkDir(fullPath);
          }
        } else if (item.endsWith('.ts')) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${dir}: ${error.message}`);
    }
  }

  walkDir(basePath);

  console.log(`Found ${files.length} TypeScript files`);

  let filesProcessed = 0;
  let filesChanged = 0;

  for (const filePath of files) {
    try {
      // Check if file contains console.*
      const content = fs.readFileSync(filePath, 'utf-8');

      if (/console\.(log|error|warn|info|debug)/.test(content)) {
        filesProcessed++;
        if (replaceConsoleCalls(filePath)) {
          filesChanged++;
          console.log(`✓ Updated: ${filePath}`);
        }
      }
    } catch (error) {
      console.error(`Error reading file ${filePath}: ${error.message}`);
    }
  }

  console.log(`\nTotal files processed: ${filesProcessed}`);
  console.log(`Files changed: ${filesChanged}`);
}

console.log('Processing app/api directory...');
processDirectory(path.join(__dirname, 'app', 'api'));

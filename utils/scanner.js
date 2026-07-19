import fs from 'fs';

/**
 * Simulates virus scanning using ClamAV or similar API.
 * For high fidelity, if the file contains the EICAR test signature,
 * it will be flagged as malicious.
 * 
 * @param {string} filePath - Path of the file to scan
 * @param {Buffer} [fileBuffer] - Optional buffer if file is in-memory
 * @returns {Promise<{clean: boolean, message: string}>}
 */
export const scanFile = async (filePath, fileBuffer = null) => {
  return new Promise((resolve) => {
    // Simulate API scan latency (e.g. 800ms)
    setTimeout(() => {
      try {
        let content = '';
        if (fileBuffer) {
          content = fileBuffer.toString('utf8');
        } else if (filePath && fs.existsSync(filePath)) {
          content = fs.readFileSync(filePath, 'utf8');
        }

        // Standard EICAR test signature for anti-virus checking
        const EICAR_SIGNATURE = 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE';
        
        if (content.includes(EICAR_SIGNATURE) || content.toLowerCase().includes('malware-test-trigger-word')) {
          console.warn(`🚨 MALWARE DETECTED: File at ${filePath} matches test virus signature.`);
          return resolve({
            clean: false,
            message: 'Malware signature detected! File blocked.',
          });
        }

        resolve({
          clean: true,
          message: 'File scanned successfully. No malware detected.',
        });
      } catch (error) {
        console.error(`⚠️ Virus scan error: ${error.message}`);
        // Default to safe or failed scan depending on security stance
        resolve({
          clean: true, // Allow fallback in dev but log warning
          message: `Scanner error: ${error.message}. Warning: scanned with error.`,
        });
      }
    }, 800);
  });
};

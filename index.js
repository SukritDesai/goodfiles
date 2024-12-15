// Import necessary modules
const express = require('express');
const fileUpload = require('express-fileupload');
const fs = require('fs');
const path = require('path');
const unzipper = require('unzipper');
const archiver = require('archiver');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware for file uploads
app.use(fileUpload());

// Serve the frontend
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>GoodNotes File Processor</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    margin: 0;
                    padding: 0;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    background-color: #f4f4f9;
                }
                .container {
                    text-align: center;
                    background: #fff;
                    padding: 20px;
                    border-radius: 8px;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                }
                h1 {
                    font-size: 24px;
                    margin-bottom: 10px;
                    color: #333;
                }
                label {
                    display: block;
                    margin-bottom: 10px;
                    font-size: 16px;
                    color: #555;
                }
                input[type="file"] {
                    margin-bottom: 15px;
                }
                button {
                    background-color: #007BFF;
                    color: #fff;
                    border: none;
                    padding: 10px 20px;
                    font-size: 16px;
                    cursor: pointer;
                    border-radius: 4px;
                    transition: background-color 0.3s;
                }
                button:hover {
                    background-color: #0056b3;
                }
                footer {
                    margin-top: 20px;
                    font-size: 12px;
                    color: #888;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>GoodNotes File Processor</h1>
                <form action="/upload" method="POST" enctype="multipart/form-data">
                    <label for="file">Upload a .goodnotes file:</label>
                    <input type="file" name="file" id="file" accept=".goodnotes" required>
                    <button type="submit">Process File</button>
                </form>
                <footer>
                    Made with ❤️ for seamless file extraction.
                </footer>
            </div>
        </body>
        </html>
    `);
});

// Handle file uploads
app.post('/upload', async (req, res) => {
    if (!req.files || !req.files.file) {
        return res.status(400).send('No file was uploaded.');
    }

    const uploadedFile = req.files.file;
    const tempDir = path.join(__dirname, 'temp');
    const outputDir = path.join(tempDir, 'output');

    // Ensure directories exist
    fs.mkdirSync(tempDir, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });

    const tempFilePath = path.join(tempDir, uploadedFile.name);
    await uploadedFile.mv(tempFilePath);

    try {
        console.log('Uploaded file saved:', tempFilePath);

        // Rename to .zip and extract
        const zipPath = `${tempFilePath}.zip`;
        fs.renameSync(tempFilePath, zipPath);
        console.log('Renamed file to .zip:', zipPath);

        const extractStream = fs.createReadStream(zipPath).pipe(unzipper.Extract({ path: outputDir }));
        await new Promise((resolve, reject) => {
            extractStream.on('close', resolve);
            extractStream.on('error', reject);
        });

        console.log('Extraction completed. Checking output directory...');
        const extractedFiles = fs.readdirSync(outputDir);
        console.log('Extracted files:', extractedFiles);

        const attachmentsDir = path.join(outputDir, 'attachments');
        if (!fs.existsSync(attachmentsDir)) {
            throw new Error('Attachments folder not found in the GoodNotes file.');
        }

        const attachmentFiles = fs.readdirSync(attachmentsDir);
        console.log('Files in attachments folder:', attachmentFiles);

        // Process files in attachments
        const processedFilesDir = path.join(tempDir, 'processed');
        fs.mkdirSync(processedFilesDir, { recursive: true });

        for (const file of attachmentFiles) {
            const filePath = path.join(attachmentsDir, file);
            const fileBuffer = fs.readFileSync(filePath);

            // Manual checks for common file types
            const header = fileBuffer.slice(0, 4).toString('hex');
            let extension = null;

            if (header.startsWith('25504446')) {
                extension = 'pdf'; // PDF
            } else if (header.startsWith('89504e47')) {
                extension = 'png'; // PNG
            } else if (header.startsWith('00000020') || header.startsWith('00000018')) {
                extension = 'mp4'; // MP4
            }

            if (extension) {
                const newFileName = `${path.basename(file, path.extname(file))}.${extension}`;
                fs.copyFileSync(filePath, path.join(processedFilesDir, newFileName));
                console.log(`Renamed and copied file to: ${newFileName}`);
            } else {
                console.warn(`Could not determine file type for: ${file}`);
            }
        }

        // Create a zip of processed files
        const zipOutputPath = path.join(tempDir, 'processed_files.zip');
        const output = fs.createWriteStream(zipOutputPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        archive.pipe(output);
        archive.directory(processedFilesDir, false);

        await new Promise((resolve, reject) => {
            output.on('close', resolve);
            archive.on('error', reject);
            archive.finalize();
        });

        console.log('Created zip file:', zipOutputPath);

        res.download(zipOutputPath, 'processed_files.zip', err => {
            if (err) console.error(err);

            // Clean up temporary files
            fs.rmSync(tempDir, { recursive: true, force: true });
            console.log('Temporary files cleaned up.');
        });

    } catch (error) {
        console.error('Error during processing:', error);
        res.status(500).send('An error occurred while processing the file.');

        // Clean up temporary files
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});


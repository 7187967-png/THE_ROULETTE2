const express = require('express');
const path = require('path');
const { handleUpload } = require('@vercel/blob/client');

const app = express();
app.use(express.json()); 
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/upload-avatar', async (req, res) => {
  console.log("--- BACKEND: Received upload token request ---");
  try {
    const jsonResponse = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        console.log("--- BACKEND: Generating token for", pathname, "---");
        return {
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
          maximumSizeInBytes: 5 * 1024 * 1024, // 5MB limit
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log('--- BACKEND: Upload completed successfully:', blob.url);
      },
    });
    return res.status(200).json(jsonResponse);
  } catch (error) {
    console.error('--- BACKEND ERROR:', error);
    return res.status(400).json({ error: error.message });
  }
});

module.exports = app;

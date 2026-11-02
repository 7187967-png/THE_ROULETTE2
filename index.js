const express = require('express');
const path = require('path');
const { handleUpload } = require('@vercel/blob/client');

const app = express();
app.use(express.json()); 
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/upload-avatar', async (req, res) => {
  try {
    const jsonResponse = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        return {
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/gif'],
          maximumSizeInBytes: 5 * 1024 * 1024, // 5MB limit
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log('Upload completed:', blob.url);
      },
    });
    return res.status(200).json(jsonResponse);
  } catch (error) {
    console.error('Token generation error:', error);
    return res.status(400).json({ error: error.message });
  }
});

module.exports = app;

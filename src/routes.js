const express = require('express');
const { createRoom, joinRoom } = require('./rooms');

const router = express.Router();

router.post('/rooms', (req, res) => {
  const hostName = req.body && req.body.hostName ? req.body.hostName : 'Host';
  const { code, hostToken } = createRoom(hostName);
  res.status(201).json({ code, hostToken });
});

router.post('/rooms/:code/join', (req, res) => {
  const { code } = req.params;
  const displayName = req.body && req.body.displayName;

  if (!displayName || !displayName.trim()) {
    return res.status(400).json({ error: 'displayName is required' });
  }

  const result = joinRoom(code, displayName.trim());
  if (result.error) {
    return res.status(result.status).json({ error: result.error });
  }

  res.status(200).json({ playerToken: result.playerToken });
});

module.exports = router;

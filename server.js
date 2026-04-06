
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { 
    maxHttpBufferSize: 1e8, // 100MB Buffer for high-res media
    cors: { origin: "*" } 
});
const path = require('path');

let chatHistory = [];
let activeUsers = {}; 
let activePolls = {}; 

app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => { 
    res.sendFile(path.join(__dirname, 'index.html')); 
});

io.on('connection', (socket) => {
    // Sync all existing data to the new client
    socket.emit('load history', chatHistory);
    socket.emit('sync polls', activePolls);

    socket.on('join', (data) => {
        // Assign a unique color and store session
        const colors = ['#f43f5e', '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#06b6d4', '#fbbf24', '#ff4757'];
        activeUsers[socket.id] = { 
            name: data.username, 
            color: colors[Math.floor(Math.random() * colors.length)],
            id: socket.id 
        };
        // Broadcast updated user list
        io.emit('user list', Object.entries(activeUsers).map(([id, info]) => ({ 
            id, 
            name: info.name, 
            color: info.color 
        })));
    });

    socket.on('chat message', (data) => {
        data.id = "wc_msg_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5);
        data.time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        data.avatarColor = activeUsers[socket.id]?.color || '#7c4dff';
        data.senderSocketId = socket.id;

        if (data.toId) {
            // Private Messaging (Whisper) logic
            io.to(data.toId).emit('chat message', data);
            socket.emit('chat message', data); 
        } else {
            // Global messaging logic
            chatHistory.push(data);
            if (chatHistory.length > 1000) chatHistory.shift();
            io.emit('chat message', data);
        }
    });

    socket.on('typing', (data) => {
        socket.broadcast.emit('typing', data);
    });

    socket.on('create poll', (pollData) => {
        const pollId = "poll_" + Date.now();
        activePolls[pollId] = { ...pollData, votes: {} };
        io.emit('new poll', { id: pollId, ...activePolls[pollId] });
    });

    socket.on('vote', ({ pollId, optionIndex, username }) => {
        if (activePolls[pollId]) {
            activePolls[pollId].votes[username] = optionIndex;
            io.emit('update poll', { id: pollId, poll: activePolls[pollId] });
        }
    });

    socket.on('delete message', (msgId) => {
        chatHistory = chatHistory.filter(m => m.id !== msgId);
        io.emit('delete message', msgId);
    });

    socket.on('clear chat', () => {
        chatHistory = [];
        activePolls = {};
        io.emit('clear chat');
    });

    socket.on('disconnect', () => {
        delete activeUsers[socket.id];
        io.emit('user list', Object.entries(activeUsers).map(([id, info]) => ({ 
            id, 
            name: info.name, 
            color: info.color 
        })));
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => {
    console.log(`=========================================`);
    console.log(`   WAYNE SERVER ONLINE      `);
    console.log(`   PORT: ${PORT}                          `);
    console.log(`=========================================`);
});

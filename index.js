const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const P = require('pino');
const axios = require('axios');
const fs = require('fs');
const config = require('./config'); // Import the config file

// Get session details from config
const ownerNumber = config.ownerNumber;
const prefix = config.prefix;
const sessionId = config.sessionId;

async function connectToWA() {
    const { state, saveCreds } = await useMultiFileAuthState(sessionId);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        logger: P({ level: 'silent' }),
        auth: state,
        version,
    });

    sock.ev.on('connection.update', (update) => {
        const { connection } = update;
        if (connection === 'open') {
            console.log('✅ Bot connected successfully');
        }
    });

    sock.ev.on('messages.upsert', async (msg) => {
        const message = msg.messages[0];
        if (!message.message) return;

        const from = message.key.remoteJid;
        const sender = message.key.participant || message.key.remoteJid;
        const text = message.message.conversation || message.message.extendedTextMessage?.text || '';

        // Check for command prefix
        if (!text.startsWith(prefix)) return;

        const command = text.slice(prefix.length).trim().split(' ')[0].toLowerCase();
        const args = text.slice(prefix.length).trim().split(' ').slice(1).join(' ');

        // Call the command handler
        await handleCommand(command, args, from, sock);
    });

    sock.ev.on('creds.update', saveCreds);
}

async function handleCommand(command, args, from, sock) {
    // 1. Auto Replies
    if (command === 'hi' || command === 'hello') {
        await sock.sendMessage(from, { text: 'Hello! How can I assist you today?' });
    }

    // 2. Group Commands
    else if (command === 'groups') {
        const groups = await sock.groupFetchAllParticipating();
        const groupNames = Object.values(groups).map((group) => group.subject).join('\n');
        await sock.sendMessage(from, { text: `📋 *Your Groups:*\n${groupNames}` });
    }

    // 3. YouTube Video Downloader
    else if (command === 'yt') {
        const url = args;
        if (!url) return sock.sendMessage(from, { text: '❌ Please provide a YouTube link.' });

        try {
            const response = await axios.get(`${config.youtubeApiUrl}${url}`);
            const videoUrl = response.data.videoUrl;
            await sock.sendMessage(from, { video: { url: videoUrl }, caption: 'Here is your video!' });
        } catch (error) {
            await sock.sendMessage(from, { text: '❌ Failed to download the video.' });
        }
    }

    // 4. Weather Information
    else if (command === 'weather') {
        const location = args;
        if (!location) return sock.sendMessage(from, { text: '❌ Please provide a location.' });

        try {
            const response = await axios.get(`https://api.weatherapi.com/v1/current.json?key=${config.weatherApiKey}&q=${location}`);
            const weather = response.data.current;

            const reply = `🌦 *Weather in ${location}:*\n\n` +
                          `🌡️ Temperature: ${weather.temp_c}°C\n` +
                          `☁️ Condition: ${weather.condition.text}\n` +
                          `💨 Wind: ${weather.wind_kph} km/h`;

            await sock.sendMessage(from, { text: reply });
        } catch (error) {
            await sock.sendMessage(from, { text: '❌ Failed to fetch weather data.' });
        }
    }

    // 5. Random Jokes
    else if (command === 'joke') {
        const response = await axios.get('https://official-joke-api.appspot.com/random_joke');
        const joke = `${response.data.setup}\n\n${response.data.punchline}`;
        await sock.sendMessage(from, { text: joke });
    }

    // 6. Currency Converter
    else if (command === 'convert') {
        const [amount, fromCurrency, toCurrency] = args.split(' ');
        if (!amount || !fromCurrency || !toCurrency) {
            return sock.sendMessage(from, { text: '❌ Usage: !convert [amount] [from] [to]' });
        }

        try {
            const response = await axios.get(`${config.exchangeRateApiUrl}${fromCurrency.toUpperCase()}`);
            const rate = response.data.rates[toCurrency.toUpperCase()];
            const converted = (amount * rate).toFixed(2);

            await sock.sendMessage(from, { text: `💱 ${amount} ${fromCurrency.toUpperCase()} = ${converted} ${toCurrency.toUpperCase()}` });
        } catch (error) {
            await sock.sendMessage(from, { text: '❌ Failed to convert currency.' });
        }
    }

    // 7. Custom Welcome Messages
    sock.ev.on('group-participants.update', async (update) => {
        const { id, participants, action } = update;

        if (action === 'add') {
            participants.forEach(async (participant) => {
                await sock.sendMessage(id, {
                    text: `👋 Welcome to the group! We hope you enjoy your stay.`,
                });
            });
        }
    });
}

connectToWA();

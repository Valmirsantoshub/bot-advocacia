const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');

const ARQUIVO_AGENDAMENTOS = path.join(__dirname, 'agendamentos.json');
const SESSIONS_FILE = path.join(__dirname, 'sessions.json');

// Garante que os arquivos existem
if (!fs.existsSync(ARQUIVO_AGENDAMENTOS)) {
    fs.writeFileSync(ARQUIVO_AGENDAMENTOS, JSON.stringify([]));
}
if (!fs.existsSync(SESSIONS_FILE)) {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify({}));
}

// Carrega sessões existentes
let sessionState = JSON.parse(fs.readFileSync(SESSIONS_FILE));

// Salvar sessões
function salvarSessoes() {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessionState, null, 2));
}

// Salvar agendamento
async function salvarAgendamento(agendamento) {
    const agendamentos = JSON.parse(fs.readFileSync(ARQUIVO_AGENDAMENTOS));
    agendamentos.push(agendamento);
    fs.writeFileSync(ARQUIVO_AGENDAMENTOS, JSON.stringify(agendamentos, null, 2));
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const text = msg.message.conversation?.toLowerCase().trim() || msg.message.extendedTextMessage?.text?.toLowerCase().trim() || '';

        if (!sessionState[sender]) {
            sessionState[sender] = { step: 'menu', agendamento: {} };
            salvarSessoes();
        }

        const state = sessionState[sender];

        if (state.step === 'menu') {
            if (/\boi\b|\bol[áa]\b|\bbom dia\b|\bboa tarde\b|\bin[íi]cio\b/.test(text)) {
                const menu = `👋 Olá, bem-vindo ao escritório de advocacia!

Como podemos ajudar?

1️⃣ Agendar Consulta  
2️⃣ Falar com Advogado  
3️⃣ Serviços  
4️⃣ Outros assuntos`;
                await sock.sendMessage(sender, { text: menu });
                return;
            }

            if (text === "1") {
                state.step = 'agendar_nome';
                salvarSessoes();
                await sock.sendMessage(sender, { text: "📅 Vamos agendar sua consulta!\n\nQual é o seu *nome*?" });
                return;
            }

            if (text === "2") {
                await sock.sendMessage(sender, { text: "⚖️ Aguardando... Em instantes um advogado falará com você!" });
                return;
            }

            if (text === "3") {
                await sock.sendMessage(sender, {
                    text: `📚 Serviços:
- Direito Trabalhista
- Direito de Família
- Direito Civil
- Ações contra INSS`
                });
                return;
            }

            if (text === "4") {
                await sock.sendMessage(sender, { text: "📩 Digite sua mensagem e nossa equipe entrará em contato." });
                return;
            }

            await sock.sendMessage(sender, { text: "🤖 Obrigado pelo contato, retornaremos o mais breve possível." });

        } else if (state.step === 'agendar_nome') {
            state.agendamento.nome = text;
            state.step = 'agendar_telefone';
            salvarSessoes();
            await sock.sendMessage(sender, { text: "📞 Agora informe seu *telefone* (com DDD):" });

        } else if (state.step === 'agendar_telefone') {
            state.agendamento.telefone = text;
            state.step = 'agendar_data';
            salvarSessoes();
            await sock.sendMessage(sender, { text: "📆 Por fim, qual é a *melhor data e horário* para a consulta?" });

        } else if (state.step === 'agendar_data') {
            state.agendamento.horario = text;

            const { nome, telefone, horario } = state.agendamento;

            await sock.sendMessage(sender, {
                text: `✅ Obrigado, ${nome}!
Recebemos seus dados:

📞 Telefone: ${telefone}
📅 Data/Horário: ${horario}

Entraremos em contato para confirmar a consulta.`
            });

            await salvarAgendamento({
                nome,
                telefone,
                horario,
                contato: sender,
                dataRegistro: new Date().toISOString()
            });

            sessionState[sender] = { step: 'menu', agendamento: {} };
            salvarSessoes();
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (update.qr) {
            console.log("🔐 Escaneie o QR Code abaixo:");
            qrcode.generate(update.qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error = new Boom(lastDisconnect?.error))?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Conexão encerrada. Reconectando:', shouldReconnect);
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('✅ Bot conectado ao WhatsApp!');
        }
    });
}

startBot();

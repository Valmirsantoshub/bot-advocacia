const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, makeInMemoryStore, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');
const http = require('http');

// Arquivo onde os agendamentos serão salvos
const ARQUIVO_AGENDAMENTOS = path.join(__dirname, 'agendamentos.json');
if (!fs.existsSync(ARQUIVO_AGENDAMENTOS)) {
    fs.writeFileSync(ARQUIVO_AGENDAMENTOS, JSON.stringify([]));
}

// Função para salvar agendamentos
async function salvarAgendamento(agendamento) {
    const agendamentos = JSON.parse(fs.readFileSync(ARQUIVO_AGENDAMENTOS));
    agendamentos.push(agendamento);
    fs.writeFileSync(ARQUIVO_AGENDAMENTOS, JSON.stringify(agendamentos, null, 2));
}

// Inicia o bot
async function startBot() {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true
    });

    sock.ev.on('creds.update', saveCreds);

    const sessionState = {};

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const text = msg.message.conversation?.toLowerCase().trim() || msg.message.extendedTextMessage?.text?.toLowerCase().trim() || '';

        if (!sessionState[sender]) {
            sessionState[sender] = { step: 'menu', agendamento: {} };
        }

        const state = sessionState[sender];

        if (state.step === 'menu') {
            if (/\boi\b|\bol[áa]\b|\bbom dia\b|\bboa tarde\b|\bin[íi]cio\b/.test(text)) {
                await sock.sendMessage(sender, {
                    text: '👋 Olá, bem-vindo ao escritório de advocacia!\n\nComo podemos ajudar?',
                    buttons: [
                        { buttonId: 'agendar', buttonText: { displayText: '📅 Agendar Consulta' }, type: 1 },
                        { buttonId: 'advogado', buttonText: { displayText: '⚖️ Falar com Advogado' }, type: 1 },
                        { buttonId: 'servicos', buttonText: { displayText: '📚 Ver Serviços' }, type: 1 },
                        { buttonId: 'outros', buttonText: { displayText: '📩 Outros assuntos' }, type: 1 },
                    ],
                    headerType: 1
                });
                return;
            }

            if (text.includes('trabalhista')) {
                await sock.sendMessage(sender, { text: "🛠️ Direito Trabalhista:\nDemissões, verbas rescisórias e outros direitos do trabalhador." });
                return;
            }

            if (text.includes("família") || text.includes("familia")) {
                await sock.sendMessage(sender, { text: "👨‍👩‍👧 Direito de Família:\nDivórcios, pensões, guarda de filhos, etc." });
                return;
            }

            if (text.includes("civil")) {
                await sock.sendMessage(sender, { text: "🏛️ Direito Civil:\nContratos, imóveis, indenizações e mais." });
                return;
            }

            if (text.includes("inss")) {
                await sock.sendMessage(sender, { text: "📄 Ações contra o INSS:\nAposentadorias, auxílios e revisões de benefícios negados." });
                return;
            }

        } else if (state.step === 'agendar_nome') {
            state.agendamento.nome = text;
            state.step = 'agendar_telefone';
            await sock.sendMessage(sender, { text: "📞 Agora informe seu *telefone* (com DDD):" });

        } else if (state.step === 'agendar_telefone') {
            state.agendamento.telefone = text;
            state.step = 'agendar_data';
            await sock.sendMessage(sender, { text: "📆 Por fim, qual é a *melhor data e horário* para a consulta?" });

        } else if (state.step === 'agendar_data') {
            state.agendamento.horario = text;

            const { nome, telefone, horario } = state.agendamento;

            await sock.sendMessage(sender, {
                text: `✅ Obrigado, ${nome}!\nRecebemos seus dados:\n\n📞 Telefone: ${telefone}\n📅 Data/Horário: ${horario}\n\nEntraremos em contato para confirmar a consulta.`
            });

            await salvarAgendamento({
                nome,
                telefone,
                horario,
                contato: sender,
                dataRegistro: new Date().toISOString()
            });

            sessionState[sender] = { step: 'menu', agendamento: {} };
        }
    });

    sock.ev.on('messages.buttons-response', async ({ messages }) => {
        const msg = messages[0];
        const sender = msg.key.remoteJid;
        const response = msg.message.buttonsResponseMessage.selectedButtonId;

        if (!sessionState[sender]) {
            sessionState[sender] = { step: 'menu', agendamento: {} };
        }

        const state = sessionState[sender];

        switch (response) {
            case 'agendar':
                state.step = 'agendar_nome';
                await sock.sendMessage(sender, { text: "📅 Vamos agendar sua consulta!\n\nQual é o seu *nome*?" });
                break;

            case 'advogado':
                await sock.sendMessage(sender, { text: "⚖️ Um advogado será avisado e entrará em contato em breve!" });
                break;

            case 'servicos':
                await sock.sendMessage(sender, {
                    text: `📚 Serviços:\n- Direito Trabalhista\n- Direito de Família\n- Direito Civil\n- Ações contra INSS`
                });
                break;

            case 'outros':
                await sock.sendMessage(sender, { text: "📩 Digite sua mensagem e nossa equipe responderá em breve." });
                break;

            default:
                await sock.sendMessage(sender, { text: "🤖 Opção inválida, tente novamente!" });
                break;
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error = new Boom(lastDisconnect?.error))?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('🔁 Conexão encerrada. Reconectando:', shouldReconnect);
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('✅ Bot conectado ao WhatsApp!');
        }
    });
}

// ⚙️ Servidor para manter Railway acordado
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot rodando com sucesso!\n');
}).listen(process.env.PORT || 3000);

// Iniciar o bot
startBot();

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');

const ARQUIVO_AGENDAMENTOS = path.join(__dirname, 'agendamentos.json');

// Garante que o arquivo de agendamentos existe
if (!fs.existsSync(ARQUIVO_AGENDAMENTOS)) {
    fs.writeFileSync(ARQUIVO_AGENDAMENTOS, JSON.stringify([]));
}
// Forçando novo deploy no Railway


async function salvarAgendamento(agendamento) {
    const agendamentos = JSON.parse(fs.readFileSync(ARQUIVO_AGENDAMENTOS));
    agendamentos.push(agendamento);
    fs.writeFileSync(ARQUIVO_AGENDAMENTOS, JSON.stringify(agendamentos, null, 2));
}
const qrcode = require('qrcode-terminal');


async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    const sock = makeWASocket({
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
            if (/\boi\b|\bolá|\bola|Ola|\b|Olá\b|\bbom dia\b|\bboa tarde\b|\bin[íi]cio\b/.test(text)) {
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
                await delay(3000); //delay de 3 segundos
                await chat.sendStateTyping(); // Simulando Digitação
                await delay(3000);
                await sock.sendMessage(sender, { text: "📅 Vamos agendar sua consulta!\n\nQual é o seu *nome*?" });
                return;
                
            }

            if (text === "2") {
                await delay(3000); //delay de 3 segundos
                await chat.sendStateTyping(); // Simulando Digitação
                await delay(3000);
                await sock.sendMessage(sender, { text: "⚖️ Aguardando... Em instantes um advogado falará com você!" });
                return;
            }

            if (text === "3") {
                await delay(3000); //delay de 3 segundos
                await chat.sendStateTyping(); // Simulando Digitação
                await delay(3000);
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
                await delay(3000); //delay de 3 segundos
                await chat.sendStateTyping(); // Simulando Digitação
                await delay(3000);
                await sock.sendMessage(sender, { text: "📩 Digite sua mensagem e nossa equipe entrará em contato." });
                return;
            }

            // Serviços específicos
            if (text.includes("trabalhista")) {
                await delay(3000); //delay de 3 segundos
                await chat.sendStateTyping(); // Simulando Digitação
                await delay(3000);
                await sock.sendMessage(sender, { text: "🛠️ Direito Trabalhista:\nTratamos de questões como demissões, verbas rescisórias e outros direitos do trabalhador." });
                return;
            }

            if (text.includes("família") || text.includes("familia")) {
                await delay(3000); //delay de 3 segundos
                await chat.sendStateTyping(); // Simulando Digitação
                await delay(3000);
                await sock.sendMessage(sender, { text: "👨‍👩‍👧 Direito de Família:\nDivórcios, pensões, guarda de filhos e outros assuntos relacionados à família." });
                return;
            }

            if (text.includes("civil")) {
                await delay(3000); //delay de 3 segundos
                await chat.sendStateTyping(); // Simulando Digitação
                await delay(3000);
                await sock.sendMessage(sender, { text: "🏛️ Direito Civil:\nAssuntos como contratos, imóveis, indenizações e mais." });
                return;
            }

            if (text.includes("inss")) {
                await delay(3000); //delay de 3 segundos
                await chat.sendStateTyping(); // Simulando Digitação
                await delay(3000);
                await sock.sendMessage(sender, { text: "📄 Ações contra o INSS:\nAposentadorias, auxílios e revisões de benefícios negados." });
                return;
            }
            await delay(3000); //delay de 3 segundos
            await chat.sendStateTyping(); // Simulando Digitação
            await delay(3000);
            await sock.sendMessage(sender, { text: "🤖 Obrigado pelo contato, retornaremos o mais breve possível." });

        } else if (state.step === 'agendar_nome') {
            state.agendamento.nome = text;
            state.step = 'agendar_telefone';
            await delay(3000); //delay de 3 segundos
            await chat.sendStateTyping(); // Simulando Digitação
            await delay(3000);
            await sock.sendMessage(sender, { text: "📞 Agora informe seu *telefone* (com DDD):" });

        } else if (state.step === 'agendar_telefone') {
            state.agendamento.telefone = text;
            state.step = 'agendar_data';
            await delay(3000); //delay de 3 segundos
            await chat.sendStateTyping(); // Simulando Digitação
            await delay(3000);
            await sock.sendMessage(sender, { text: "📆 Por fim, qual é a *melhor data e horário* para a consulta?" });

        } else if (state.step === 'agendar_data') {
            state.agendamento.horario = text;

            const { nome, telefone, horario } = state.agendamento;
            await delay(3000); //delay de 3 segundos
            await chat.sendStateTyping(); // Simulando Digitação
            await delay(3000);
            await sock.sendMessage(sender, {
                text: `✅ Obrigado, ${nome}!
Recebemos seus dados:

📞 Telefone: ${telefone}
📅 Data/Horário: ${horario}

Entraremos em contato para confirmar a consulta.`
            });

            // Salvando agendamento no arquivo
            await delay(3000); //delay de 3 segundos
            await chat.sendStateTyping(); // Simulando Digitação
            await delay(3000);
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

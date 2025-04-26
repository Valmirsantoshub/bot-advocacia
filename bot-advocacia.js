const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');

const ARQUIVO_AGENDAMENTOS = path.join(__dirname, 'agendamentos.json');

if (!fs.existsSync(ARQUIVO_AGENDAMENTOS)) {
    fs.writeFileSync(ARQUIVO_AGENDAMENTOS, JSON.stringify([]));
}

async function salvarAgendamento(agendamento) {
    const agendamentos = JSON.parse(fs.readFileSync(ARQUIVO_AGENDAMENTOS));
    agendamentos.push(agendamento);
    fs.writeFileSync(ARQUIVO_AGENDAMENTOS, JSON.stringify(agendamentos, null, 2));
}

// Função que simula digitação antes de enviar a mensagem
async function digitarAntesDeResponder(sock, sender, tempo = 3000) {
    await sock.sendPresenceUpdate('composing', sender);
    await new Promise(resolve => setTimeout(resolve, tempo));
    await sock.sendPresenceUpdate('paused', sender);
}

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
            sessionState[sender] = { step: 'menu', agendamento: {}, pausado: false };
        }
        
        

        const state = sessionState[sender];
        if (state.pausado) {
            // Se o cliente quiser voltar ao bot automatizado
            if (text === "voltar" || text === "menu") {
                state.pausado = false;
                state.step = 'menu';
                await sock.sendMessage(sender, { text: "🤖 Atendimento automático reativado. Envie 'oi' para começar novamente." });
            } else {
                // Ignora as mensagens durante o atendimento humano
                console.log(`🛑 Atendimento pausado com ${sender}`);
            }
            return;
        }
        

        if (state.step === 'menu') {
            if (/oi|ol[áa]|bom dia|boa tarde|in[íi]cio|quem é|boa noite/.test(text)) {
                const menu = `👋 Olá, bem-vindo ao escritório de advocacia!
                

Como podemos ajudar?

1️⃣ Agendar Consulta  
2️⃣ Falar com Advogado  
3️⃣ Serviços  
4️⃣ Outros assuntos`;

                await digitarAntesDeResponder(sock, sender);
                await sock.sendMessage(sender, { text: menu });
                return;
            }

            if (text === "1") {
                state.step = 'agendar_nome';
                await digitarAntesDeResponder(sock, sender);
                await sock.sendMessage(sender, { text: "📅 Vamos agendar sua consulta!\n\nQual é o seu *nome*?" });
                return;
            }

            if (text === "2") {
                state.pausado = true;
                await digitarAntesDeResponder(sock, sender);
                await sock.sendMessage(sender, { text: "⚖️ Encaminhando para um advogado...\nVocê será respondido em instantes por nossa equipe humana.\n\nDigite *voltar* ou *menu* se quiser retornar ao atendimento automático." });
                return;
            }
            

            if (text === "3") {
                await digitarAntesDeResponder(sock, sender);
                await sock.sendMessage(sender, {
                    text: `📚 Serviços:\n- Direito Trabalhista\n- Direito de Família\n- Direito Civil\n- Ações contra INSS`
                });
                return;
            }

            if (text === "4") {
                await digitarAntesDeResponder(sock, sender);
                await sock.sendMessage(sender, { text: "📩 Digite sua mensagem e nossa equipe entrará em contato." });
                return;
            }

            // Serviços específicos
            if (text.includes("trabalhista")) {
                await digitarAntesDeResponder(sock, sender);
                await sock.sendMessage(sender, { text: "🛠️ Direito Trabalhista:\nTratamos de demissões, verbas rescisórias e outros direitos do trabalhador." });
                return;
            }

            if (text.includes("família") || text.includes("familia")) {
                await digitarAntesDeResponder(sock, sender);
                await sock.sendMessage(sender, { text: "👨‍👩‍👧 Direito de Família:\nDivórcios, pensões, guarda de filhos e outros assuntos familiares." });
                return;
            }

            if (text.includes("civil")) {
                await digitarAntesDeResponder(sock, sender);
                await sock.sendMessage(sender, { text: "🏛️ Direito Civil:\nTratamos de contratos, imóveis, indenizações e mais." });
                return;
            }

            if (text.includes("inss")) {
                await digitarAntesDeResponder(sock, sender);
                await sock.sendMessage(sender, { text: "📄 INSS:\nAposentadorias, auxílios e revisões de benefícios negados." });
                return;
            }

            await digitarAntesDeResponder(sock, sender);
            await sock.sendMessage(sender, { text: "🤖 Obrigado pelo contato. Retornaremos o Mais Breve Possivel" });

        } else if (state.step === 'agendar_nome') {
            state.agendamento.nome = text;
            state.step = 'agendar_telefone';
            await digitarAntesDeResponder(sock, sender);
            await sock.sendMessage(sender, { text: "📞 Agora informe seu *telefone* com DDD:" });

        } else if (state.step === 'agendar_telefone') {
            state.agendamento.telefone = text;
            state.step = 'agendar_data';
            await digitarAntesDeResponder(sock, sender);
            await sock.sendMessage(sender, { text: "📆 Qual a *melhor data e horário* para a consulta?" });

        } else if (state.step === 'agendar_data') {
            state.agendamento.horario = text;
            const { nome, telefone, horario } = state.agendamento;

            await digitarAntesDeResponder(sock, sender);
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

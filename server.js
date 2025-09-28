import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { CohereClient } from "cohere-ai";

// --- CONFIGURAÇÃO DAS APIs (SUAS CHAVES JÁ ESTÃO AQUI) ---
const GEMINI_API_KEY = "AIzaSyBlB-LMuBI_TpDiKqCjO1zL-KeOjnexODQ";
const COHERE_API_KEY = "t6q0XrPj9YO8ct6E42LswKl93oKLExLRnK7ubkTV";

// --- INICIALIZAÇÃO DOS CLIENTES DE IA ---
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const cohere = new CohereClient({ token: COHERE_API_KEY });

// --- CONFIGURAÇÃO DO SERVIDOR EXPRESS ---
const app = express();
const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());

// --- LÓGICA DA IA (O CÉREBRO) ---

// Função para montar o prompt que será enviado para as IAs
const buildSystemPrompt = (userPrompt, projectState) => {
    const fileList = Object.keys(projectState.files).join(', ') || 'Nenhum';
    return `Você é um assistente de desenvolvimento de jogos 3D que se comunica via JSON.
    O usuário pediu: "${userPrompt}".
    O projeto atual contém os seguintes arquivos: ${fileList}.
    O conteúdo dos arquivos é: ${JSON.stringify(projectState.files, null, 2)}.
    Sua tarefa é responder com uma ação JSON. As ações válidas são:
    1. {"action": "CREATE_OR_UPDATE_FILE", "fileName": "nome.js", "content": "código javascript aqui..."}
    2. {"action": "CHAT_MESSAGE", "content": "sua mensagem de texto aqui..."}
    Analise o pedido e o estado do projeto, e retorne a ação JSON apropriada para progredir no jogo. Gere apenas código three.js moderno usando módulos ES6.`;
};

// Função para chamar a API do Gemini
async function callGeminiAPI(prompt) {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json|```/g, '').trim();
    return JSON.parse(text);
}

// Função para chamar a API da Cohere
async function callCohereAPI(prompt) {
    const response = await cohere.chat({ message: prompt, model: "command-r" });
    const text = response.text.replace(/```json|```/g, '').trim();
    return JSON.parse(text);
}


// --- ROTAS DO SERVIDOR ---

// Rota principal: serve a interface do usuário (o arquivo index.html)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Rota da API: onde a mágica acontece
app.post('/api/generate', async (req, res) => {
    const { userPrompt, projectState } = req.body;
    const systemPrompt = buildSystemPrompt(userPrompt, projectState);
    let newProjectState = { ...projectState };
    let aiResponse;

    try {
        console.log("Tentando API do Gemini...");
        aiResponse = await callGeminiAPI(systemPrompt);
    } catch (error) {
        console.error("Erro no Gemini, tentando Cohere:", error.message);
        try {
            console.log("Tentando API da Cohere...");
            aiResponse = await callCohereAPI(systemPrompt);
        } catch (cohereError) {
            console.error("Erro na API da Cohere:", cohereError.message);
            return res.status(500).json({ error: "Ambas as APIs falharam." });
        }
    }

    if (aiResponse.action === "CREATE_OR_UPDATE_FILE") {
        newProjectState.files[aiResponse.fileName] = aiResponse.content;
    }

    const template = await fs.readFile(path.join(__dirname, 'template.html'), 'utf-8');
    const gameScripts = Object.values(newProjectState.files).join('\n\n//------\n\n');
    const gameHtml = template.replace('{{GAME_CODE}}', `<script type="module">${gameScripts}</script>`);

    res.status(200).json({ aiResponse, newProjectState, gameHtml });
});


// --- INICIA O SERVIDOR ---
app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});
      

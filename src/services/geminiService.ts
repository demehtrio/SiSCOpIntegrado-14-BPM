import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export interface ChecklistData {
  mapaDiario?: 'SIM' | 'NÃO';
  equipamentos?: string[];
  luzFarolAlto?: string;
  luzFarolBaixo?: string;
  luzLanterna?: string;
  luzFreioLanternaTraseira?: string[];
  luzPlaca?: string;
  pneus?: string;
  sistemaFreio?: string;
  oleoMotor?: string;
  proxTrocaOleoKm?: string;
  partesInternas?: string[];
  sistemaTracao?: string;
  partesExternas?: string[];
  limpeza?: string;
  descricaoAlteracoes?: string;
}

export async function parseChecklistDescription(description: string): Promise<Partial<ChecklistData>> {
  if (!process.env.GEMINI_API_KEY) {
    console.warn("GEMINI_API_KEY not found. AI parsing disabled.");
    return {};
  }

  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `
    Analise a seguinte descrição de estado de uma viatura policial e extraia as informações para um checklist.
    Retorne APENAS um objeto JSON com os campos que encontrar.
    
    Campos possíveis:
    - mapaDiario: 'SIM' ou 'NÃO'
    - equipamentos: array de strings (ex: ["Giroflex", "Sirene"])
    - luzFarolAlto, luzFarolBaixo, luzLanterna, luzPlaca: 'Todos funcionam', 'Direito queimado', 'Esquerdo queimado', 'Todas queimados', 'Funciona', 'Queimada'
    - luzFreioLanternaTraseira: array de strings (ex: ["TODAS FUNCIONANDO", "Luz de Freio Dir. Queimada"])
    - pneus: 'Novo', 'Meia vida', 'Inutilizável (Motivo de baixa)'
    - sistemaFreio: 'Freio funcionando', 'Freio falhando', 'Sem Freios (Motivo de baixa)'
    - oleoMotor: 'Nível Normal', 'Nível Baixo', 'Nível sem condições (Baixar VTR)'
    - proxTrocaOleoKm: string com o KM
    - partesInternas: array de strings (ex: ["SEM ALTERAÇÃO", "BANCOS"])
    - partesExternas: array de strings (ex: ["Sem Alteração", "PINTURA"])
    - sistemaTracao: 'Kit de tração em condições', 'Kit de tração desgastado', 'Kit de tração sem condições (Baixar VTR)'
    - limpeza: 'SIM' ou 'NÃO'
    - descricaoAlteracoes: string com detalhes adicionais
    
    Descrição: "${description}"
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return {};
  } catch (error) {
    console.error("Error parsing checklist with Gemini:", error);
    return {};
  }
}

export async function extractLicensePlateFromImage(base64Image: string): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    console.warn("GEMINI_API_KEY not found. Plate extraction disabled.");
    return "NONE";
  }

  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = "Identifique a placa da viatura nesta imagem. Retorne APENAS a placa (ex: ABC1D23) ou a palavra 'NONE' se não encontrar.";

  try {
    const imageParts = [
      {
        inlineData: {
          data: base64Image.split(",")[1],
          mimeType: "image/jpeg",
        },
      },
    ];

    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    return response.text().trim().toUpperCase();
  } catch (error) {
    console.error("Error extracting plate with Gemini:", error);
    return "NONE";
  }
}

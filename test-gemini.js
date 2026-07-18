const { OpenAI } = require('openai');
const geminiApiKey = "AQ.Ab8RN6ImcQhDB7nsg_OQND8FAo0RW1cUXdNtxygv2XgO80pjjQ";

const gemini = new OpenAI({
  apiKey: geminiApiKey,
  baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/'
});

async function main() {
  console.log("Calling Gemini API using OpenAI Compatibility...");
  const response = await gemini.chat.completions.create({
    model: 'gemini-1.5-flash',
    messages: [{ role: 'user', content: 'Di "Hola Mundo" en dos palabras.' }],
  });
  console.log("Success! Gemini response:", response.choices[0].message.content);
}

main().catch(error => {
  console.error("Gemini Test Failed with error:", error);
});

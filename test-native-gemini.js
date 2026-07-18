async function main() {
  const geminiApiKey = "AQ.Ab8RN6ImcQhDB7nsg_OQND8FAo0RW1cUXdNtxygv2XgO80pjjQ";
  console.log("Calling native Gemini gemini-3.5-flash endpoint...");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${geminiApiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Hola, di "Hola Mundo" en dos palabras.' }] }]
      })
    }
  );
  const data = await response.json();
  console.log("Native Gemini API response:", JSON.stringify(data, null, 2));
}

main().catch(console.error);

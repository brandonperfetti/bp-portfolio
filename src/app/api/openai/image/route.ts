import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export const runtime = "edge";

export async function POST(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405 });
  }
  let data;

  try {
    data = await req.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  if (!data.message) {
    return new Response(JSON.stringify({ error: "No message provided" }), { status: 400 });
  }

  try {
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: data.message,
      n: 1,
      size: "1024x1024",
      quality: "hd",
    });

    const imageUrl = response.data[0].url;
    return new Response(JSON.stringify({ image: imageUrl }), { status: 200 });
  } catch (error) {
    console.error("Failed to generate image:", error);
    return new Response(JSON.stringify({ error: "Failed to generate image" }), { status: 500 });
  }
}

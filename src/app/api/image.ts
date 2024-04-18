import { NextApiRequest, NextApiResponse } from "next/types";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  try {
    // Updated API method call
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: req.body?.message,
      n: 1,
      size: "1024x1024",
      quality: "hd",
    });

    // Correctly access the URL from the new response structure
    const imageUrl = response.data[0].url;

    res.status(200).json({
      image: imageUrl,
    });
  } catch (error) {
    console.error("Failed to generate image:", error);
    res.status(500).json({ error: "Failed to generate image" });
  }
}

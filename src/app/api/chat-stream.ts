import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// Define a TypeScript interface for the message structure
interface IMessage {
  role: string;
  content: string;
}

export const runtime = "edge";
export default async function POST(req: Request): Promise<Response> {
  try {
    const forwardedProps = await req.json();
    console.log("Received props:", JSON.stringify(forwardedProps, null, 2));

    // Check if messages is an array
    if (!Array.isArray(forwardedProps.messages)) {
      return new Response(
        JSON.stringify({ error: "messages must be an array" }),
        {
          headers: { "Content-Type": "application/json" },
          status: 400,
        }
      );
    }

    // Validate each message structure using the IMessage interface
    if (
      !forwardedProps.messages.every(
        (msg: IMessage) => msg.role && typeof msg.content === "string"
      )
    ) {
      return new Response(
        JSON.stringify({ error: "Each message must have a role and content" }),
        { headers: { "Content-Type": "application/json" }, status: 400 }
      );
    }

    const stream = openai.beta.chat.completions
      .stream({
        model: "gpt-4",
        ...forwardedProps,
        stream: true,
      })
      .toReadableStream();

    return new Response(stream);
  } catch (error: any) {
    console.error("Error processing the request:", error);
    // More detailed error response based on the type of error
    const status = error.response?.status || 500;
    const message = error.response?.data?.message || error.message;
    return new Response(JSON.stringify({ error: message }), {
      headers: { "Content-Type": "application/json" },
      status: status,
    });
  }
}

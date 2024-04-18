import { Configuration, OpenAIApi } from "openai";

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

export default async function handler(req, res) {
  const message = `${req.body?.prompt}`;
  const context = `${JSON.stringify(req.body?.context)}`;
  const content = `${context},${message}`;

  const conversation = [{ role: "user", content: content }];
  const response = await openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    messages: conversation,
  });

  conversation.push({
    role: "assistant",
    content: response.data.choices[0].message.content,
  });

  const completion = await openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    messages: [
      {
        role: "system",
        content:
          "Let's work together to get the best possible ChatGPT response to a prompt that I give you. From now on we will interact in the following sequence: 1. My initial prompt [I will give you an initial prompt] 2. Your request for more details: [You will request 3-5 specific details about my original prompt in order to fully understand what I want from you. Output these questions in an easy to answer list format] 3. My Answers [I will then answer these questions - providing you with the key details you need] 4. You will then act as a professional prompt engineer and create a more detailed prompt for ChatGPT, combining my original prompt, along with the additional details provided in step 3. Output this new prompt for ChatGPT, and ask me if am happy with it. 5. If I say yes, continue to generate a response to this upgraded prompt. 6. If I say no, ask me which details about this prompt I am not happy with. 7. I will then provide you will this extra information. 8. Generate another prompt, similar to step 4, but taking into account the alterations I asked for in step 7. Repeat steps 6-8 until I am happy with the prompt you generate. If you fully understand your assignment, respond with: `How may I help you today?`",
      },
      ...conversation,
    ],

    temperature: 1.1,
    max_tokens: 2048,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0.6,
    stop: ["Human: ", "AI: "],
  });
  if (completion.statusText === "OK") {
    res
      .status(200)
      .json({ message: completion.data.choices[0].message.content });
  } else {
    res.status(500).json({ message: "AI error" });
  }
}

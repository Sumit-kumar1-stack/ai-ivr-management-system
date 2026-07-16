import {

  generateAIResponse

} from "@/services/conversations/ai-response.service";

export class OpenAIService {

  static async reply(

    prompt: string

  ) {

    return await generateAIResponse(

      prompt

    );

  }

}
import axios from 'axios';

const LINE_API_URL = 'https://api.line.me/v2/bot/message/push';

export class LineBotService {
  private static channelAccessToken: string | undefined;

  static setToken(token: string | undefined) {
    this.channelAccessToken = token;
  }

  static async pushMessage(lineUserId: string, text: string): Promise<void> {
    if (!this.channelAccessToken) {
      console.error('LINE_CHANNEL_ACCESS_TOKEN is not set.');
      // Optionally throw an error or handle it differently
      return; 
    }

    if (!lineUserId || !text) {
        console.error('Invalid arguments for pushMessage: lineUserId and text are required.');
        return;
    }

    try {
      await axios.post(LINE_API_URL, {
        to: lineUserId,
        messages: [{ type: 'text', text: text }]
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.channelAccessToken}`
        }
      });
      console.log(`Message pushed successfully to ${lineUserId}`);
    } catch (error: any) {
      console.error(`Error pushing message to ${lineUserId}: ${error.response?.data || error.message}`);
      // Optionally re-throw or handle specific errors
      throw error; 
    }
  }
}

export interface SystemSettings {
  llm: {
    apiBaseUrl: string;
    apiKey: string;
    model: string;
  };
  transcription: {
    apiBaseUrl: string;
    apiKey: string;
    model: string;
    language: string;
  };
  feishu?: {
    appId: string;
    appSecret: string;
    approvalCode: string;
  };
}

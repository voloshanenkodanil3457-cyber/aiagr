import { config as loadEnv } from 'dotenv';
import { config, higgsfield } from '@higgsfield/client/v2';
import { fileURLToPath } from 'node:url';

loadEnv({ path: fileURLToPath(new URL('./.env.local', import.meta.url)), quiet: true });

async function main() {
  const credentials = process.env.HF_CREDENTIALS;
  if (!credentials || !/^[^:\s]+:[^:\s]+$/.test(credentials)) {
    console.error('Enter HF_CREDENTIALS locally in .env.local as key-id:key-secret. No request was sent.');
    process.exitCode = 2;
    return;
  }
  try {
    config({ credentials, maxRetries: 0 });
    const result = await higgsfield.subscribe('bytedance/seedance-2.5/text-to-video', {
      input: {
        prompt: 'A cinematic scene at sunset',
        duration: 5,
        resolution: '720p',
        aspect_ratio: '16:9',
        output_format: 'mp4',
        generate_audio: true,
      },
      withPolling: true,
    });
    if (result.status !== 'completed') {
      console.error('Generation did not complete successfully (failed, canceled, or moderated).');
      process.exitCode = 1;
      return;
    }
    const videoUrl = result.video?.url;
    if (typeof videoUrl !== 'string' || !videoUrl.startsWith('https://')) {
      console.error('No valid HTTPS video URL was returned.');
      process.exitCode = 1;
      return;
    }
    console.log(videoUrl);
  } catch (error: unknown) {
    // Never log raw SDK errors: they can contain request metadata or credentials.
    const status = (error as { statusCode?: unknown; response?: { status?: unknown } })?.statusCode ?? (error as { response?: { status?: unknown } })?.response?.status;
    const classes = ['AuthenticationError','NotEnoughCreditsError','ValidationError','BadInputError','TimeoutError','APIError'];
    const kind = error instanceof Error && classes.includes(error.name) ? error.name : 'RequestError';
    console.error(kind + ': Higgsfield request failed or its completion could not be verified.' + (typeof status === 'number' ? ` HTTP ${status}.` : '') + ' Check the API dashboard before retrying.');
    process.exitCode = 1;
  }
}
void main();

import http from 'k6/http';
import { check, sleep } from 'k6';

const baseUrl = __ENV.BASE_URL;
const accessToken = __ENV.ACCESS_TOKEN;
const sessionId = __ENV.SESSION_ID;
const sessionQuestionId = __ENV.SESSION_QUESTION_ID;

if (!baseUrl || !accessToken || !sessionId || !sessionQuestionId) {
  throw new Error(
    'BASE_URL, ACCESS_TOKEN, SESSION_ID and SESSION_QUESTION_ID are required.',
  );
}

export const options = {
  scenarios: {
    autosave: {
      executor: 'constant-vus',
      vus: 500,
      duration: '2m',
      exec: 'autosave',
    },
    submit_wave: {
      executor: 'per-vu-iterations',
      vus: 500,
      iterations: 1,
      startTime: '2m',
      maxDuration: '30s',
      exec: 'submit',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{operation:autosave}': ['p(95)<800'],
    'http_req_duration{operation:submit}': ['p(95)<2000'],
  },
};

const headers = {
  apikey: __ENV.PUBLISHABLE_KEY || '',
  Authorization: `Bearer ${accessToken}`,
  'Content-Type': 'application/json',
};

export function autosave() {
  const response = http.post(
    `${baseUrl}/rest/v1/rpc/save_session_answers`,
    JSON.stringify({
      p_session_id: sessionId,
      p_answers: [
        {
          session_question_id: sessionQuestionId,
          selected_option_id: null,
          short_answer_text: null,
          answer_json: { value: `load-${__VU}-${__ITER}` },
        },
      ],
    }),
    { headers, tags: { operation: 'autosave' } },
  );

  check(response, { 'autosave accepted': (r) => r.status === 200 });
  sleep(10);
}

export function submit() {
  const response = http.post(
    `${baseUrl}/rest/v1/rpc/submit_exam_session`,
    JSON.stringify({ p_session_id: sessionId }),
    { headers, tags: { operation: 'submit' } },
  );

  check(response, { 'submit accepted': (r) => r.status === 200 });
}

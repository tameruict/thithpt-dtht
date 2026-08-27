import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

const users = new SharedArray('load users', () => {
  const path = __ENV.USERS_FILE;
  if (!path) throw new Error('USERS_FILE is required');
  const parsed = JSON.parse(open(path));
  return Array.isArray(parsed) ? parsed : parsed.dataset;
});

const baseUrl = __ENV.BASE_URL;
function userForVu() {
  const user = users[(__VU - 1) % users.length];
  if (!user) throw new Error('No load-test user for VU');
  return user;
}

if (!baseUrl || users.length === 0) {
  throw new Error(
    'BASE_URL and USERS_FILE with sessionId/sessionQuestionId entries are required.',
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
  'Content-Type': 'application/json',
};

// Model staggered student start times instead of a synchronized thundering herd.
const phaseJitterMs = (__VU * 7919) % 10000;
const submitJitterMs = (__VU * 104729) % 10000;

export function autosave() {
  const user = userForVu();
  if (__ITER === 0 && phaseJitterMs > 0) sleep(phaseJitterMs / 1000);
  const response = http.post(
    `${baseUrl}/rest/v1/rpc/save_session_answers`,
    JSON.stringify({
      p_session_id: user.sessionId,
      p_answers: [
        {
          session_question_id: user.sessionQuestionId,
          selected_option_id: null,
          short_answer_text: null,
          answer_json: { value: `load-${__VU}-${__ITER}` },
        },
      ],
    }),
    { headers: { ...headers, Authorization: `Bearer ${user.accessToken}` }, tags: { operation: 'autosave' } },
  );

  check(response, { 'autosave accepted': (r) => r.status === 200 || r.status === 204 });
  sleep(10);
}

export function submit() {
  const user = userForVu();
  if (submitJitterMs > 0) sleep(submitJitterMs / 1000);
  const response = http.post(
    `${baseUrl}/rest/v1/rpc/submit_exam_session`,
    JSON.stringify({ p_session_id: user.sessionId }),
    { headers: { ...headers, Authorization: `Bearer ${user.accessToken}` }, tags: { operation: 'submit' } },
  );

  check(response, { 'submit accepted': (r) => r.status === 200 || r.status === 204 });
}

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ExamDraft {
  sessionId: string;
  choiceAnswers: Record<string, string>;
  textAnswers: Record<string, string>;
  trueFalseAnswers: Record<string, Record<string, 'true' | 'false'>>;
  marked: number[];
  currentQuestion: number;
  updatedAt: number;
}

export interface ExamHistory {
  id: string;
  subject: string;
  examSet?: string;
  score: string;
  date: string;
}

export interface KeyRecord {
  code: string;
  remainingAttempts: number;
}

export interface CandidateInfo {
  code: string;
  name: string;
  school: string;
  dob: string;
  gender: string;
  province: string;
  district: string;
  phone: string;
  session: number | null;
}

interface ExamState {
  hasHydrated: boolean;
  theme: 'light' | 'dark';
  zoom: number;
  currentQuestion: number;
  marked: number[];
  isAuthenticated: boolean;
  candidateInfo: CandidateInfo | null;

  activeKeys: KeyRecord[];
  usedKeys: string[];
  examHistory: ExamHistory[];
  selectedSubjectCode: string | null;
  selectedExamSetId: string | null;
  roomKey: string | null;
  currentSessionId: string | null;
  examDraft: ExamDraft | null;

  setTheme: (theme: 'light' | 'dark') => void;
  setHasHydrated: (hasHydrated: boolean) => void;
  setZoom: (zoom: number) => void;
  setCurrentQuestion: (q: number) => void;
  toggleMark: (q: number) => void;
  login: (code: string, profile?: Partial<Omit<CandidateInfo, 'code'>>) => void;
  logout: () => void;
  updateProfile: (profile: Partial<Omit<CandidateInfo, 'code'>>) => void;
  setSession: (sessionId: string, key: string) => void;
  selectExamSet: (subjectCode: string, examSetId: string) => void;
  setDraft: (draft: ExamDraft) => void;
  clearDraft: () => void;
  finishSession: () => void;
}

export const useExamStore = create<ExamState>()(
  persist(
    (set) => ({
      hasHydrated: false,
      theme: 'light',
      zoom: 100,
      currentQuestion: 1,
      marked: [],
      isAuthenticated: false,
      candidateInfo: null,
      activeKeys: [],
      usedKeys: [],
      examHistory: [],
      selectedSubjectCode: null,
      selectedExamSetId: null,
      roomKey: null,
      currentSessionId: null,
      examDraft: null,

      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      setTheme: (theme) => set({ theme }),
      setZoom: (zoom) => set({ zoom }),
      setCurrentQuestion: (currentQuestion) => set({ currentQuestion }),
      toggleMark: (q) =>
        set((state) => ({
          marked: state.marked.includes(q)
            ? state.marked.filter((id) => id !== q)
            : [...state.marked, q],
        })),
      login: (code, profile) =>
        set({
          isAuthenticated: true,
          candidateInfo: {
            code,
            name: 'Thi sinh',
            school: '',
            dob: '',
            gender: '',
            province: '',
            district: '',
            phone: '',
            session: null, // Ca thi thực tế lấy từ DB, không hardcode
            ...(profile ?? {}),
          },
        }),
      logout: () =>
        set({
          isAuthenticated: false,
          candidateInfo: null,
          selectedSubjectCode: null,
          selectedExamSetId: null,
          roomKey: null,
          currentSessionId: null,
          examDraft: null,
          marked: [],
        }),

      updateProfile: (profile) =>
        set((state) => ({
          candidateInfo: state.candidateInfo
            ? { ...state.candidateInfo, ...profile }
            : null,
        })),

      setSession: (sessionId, key) => {
        set({
          currentSessionId: sessionId,
          roomKey: key,
        });
      },

      selectExamSet: (selectedSubjectCode, selectedExamSetId) =>
        set({
          selectedSubjectCode,
          selectedExamSetId,
          marked: [],
          currentQuestion: 1,
          roomKey: null,
          currentSessionId: null,
        }),
      setDraft: (examDraft) => set({ examDraft }),
      clearDraft: () => set({ examDraft: null }),
      finishSession: () =>
        set({
          roomKey: null,
          currentSessionId: null,
          examDraft: null,
          marked: [],
          currentQuestion: 1,
        }),
    }),
    {
      name: 'exam-storage',
      // Chỉ persist state cần thiết — KHÔNG persist marked vì đáp án đã lưu ở
      // Supabase và được load lại khi vào /exam; giảm dung lượng, tránh stale.
      partialize: (state) => ({
        theme: state.theme,
        zoom: state.zoom,
        isAuthenticated: state.isAuthenticated,
        candidateInfo: state.candidateInfo,
        currentSessionId: state.currentSessionId,
        roomKey: state.roomKey,
        selectedSubjectCode: state.selectedSubjectCode,
        selectedExamSetId: state.selectedExamSetId,
        examHistory: state.examHistory,
        activeKeys: state.activeKeys,
        usedKeys: state.usedKeys,
        // Bản nháp làm bài để resume nhanh khi reload; bị xóa khi phiên kết thúc.
        examDraft: state.examDraft,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

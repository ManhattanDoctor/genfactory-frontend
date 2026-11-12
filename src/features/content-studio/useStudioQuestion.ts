import { useRef, type RefObject } from 'react';
import { api, getSession } from '../../lib/api';
import type { IModelDescription } from '../../lib/types';
import type { useContentConversation } from './useContentConversation';
import { parseStudioQuestion, withStudioContext, type StudioQuestion } from './studioAgent';

export function useStudioQuestion({
  work,
  busy,
  session,
  agent,
  alive,
}: {
  work: ReturnType<typeof useContentConversation>;
  busy: boolean;
  session: string | null;
  agent?: IModelDescription;
  alive: RefObject<boolean>;
}): (question: StudioQuestion, messageId: number, answer: string) => Promise<boolean> {
  const answeringQuestion = useRef(false);
  async function answerQuestion(
    question: StudioQuestion,
    messageId: number,
    answer: string,
  ): Promise<boolean> {
    if (busy || !work.id || !session || answeringQuestion.current) return false;
    answeringQuestion.current = true;
    const id = work.id;
    const sid = session;
    try {
      const latest = await api.messages(id, 0, undefined, sid);
      if (getSession() !== sid || !alive.current) return false;
      const last = latest.items[0];
      if (
        last?.id !== messageId ||
        last.role !== 'ASSISTANT' ||
        !parseStudioQuestion(last.text, latest.items.find((item) => item.role === 'USER')?.text)
      ) {
        work.setError('На этот вопрос уже ответили. Обновите диалог.');
        return false;
      }
      const connection = { uid: question.context.uid, settings: question.context.settings };
      const ids: Array<number> =
        question.context.uid === 'IMAGE'
          ? (question.context.input.request as { task: { fileIds: Array<number> } }).task.fileIds
          : (question.context.input.fileIds as Array<number>);
      let answerContext = question.context;
      if (!ids.length && !answerContext.historyFiles) {
        const historyFiles = await work.historyFiles();
        if (historyFiles.length) {
          answerContext = { ...answerContext, historyFiles, input: { ...answerContext.input } };
          delete answerContext.input.isDrawNew;
        }
      }
      return await work.submit(
        {
          role: 'USER',
          text: withStudioContext(`Ответ на вопрос «${question.question}»: ${answer}`, answerContext),
          files: ids,
          settings: { tools: [connection] },
        },
        answer,
        [connection],
        agent,
      );
    } catch (error) {
      work.setError(error instanceof Error ? error.message : 'Не удалось отправить ответ.');
      return false;
    } finally {
      answeringQuestion.current = false;
    }
  }

  return answerQuestion;
}

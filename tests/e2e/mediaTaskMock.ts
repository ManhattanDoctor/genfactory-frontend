/** Standalone media tasks return saved files, not conversation messages. */
export function mediaTaskResponse(template: any, request: any) {
  const { model, frameImages: _frames, stream: _stream, ...options } = request.options;
  const file = {
    ...template,
    directory: request.fileOutput?.directory,
    tags: request.fileOutput?.tags,
    origin: {
      kind: 'GENERATION',
      operationId: `task:test-${request.task.session}`,
      sourceFileIds: request.task.fileIds || [],
      generation: { model: { provider: request.model, model }, prompt: request.task.prompt, options },
    },
  };
  return {
    result: file.type === 'VIDEO' ? { externalId: 'test-video', fileId: file.id } : [],
    files: [file],
    cost: { status: 'FINAL', amounts: [{ amount: '1', coinId: 'RUB' }] },
  };
}

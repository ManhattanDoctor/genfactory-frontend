import { PromptTemplate } from './PromptTemplate';
import { templateVariableLabel } from './templateRecipe';

interface TemplateSlot {
  start: number;
  end: number;
  expression: string;
}

export interface ComposerTemplate {
  text: string;
  slots: TemplateSlot[];
  values: Record<string, string>;
}

function renderSlot(recipe: PromptTemplate, values: Record<string, string>): string {
  const missing = recipe.variables.filter((key) => !values[key]?.trim());
  return missing.length
    ? missing.map((key) => '‹' + templateVariableLabel(key) + '›').join(', ')
    : recipe.fill(values);
}

export function prepareComposerTemplate(source: string, withPhoto: boolean): ComposerTemplate {
  const recipe = new PromptTemplate(source);
  const values: Record<string, string> = {};
  if (withPhoto) {
    for (const key of recipe.variables) {
      if (['SUBJECT', 'TOPIC_OBJECT', 'OBJECT'].includes(key) && !recipe.choices.has(key))
        values[key] = 'Объект с приложенного фото';
    }
  }
  let text = '';
  const slots: TemplateSlot[] = [];
  for (const part of recipe.sourceParts()) {
    const start = text.length;
    if (!part.highlighted) text += part.text;
    else {
      text += renderSlot(new PromptTemplate(part.text), values);
      slots.push({ start, end: text.length, expression: part.text });
    }
  }
  return { text, slots, values };
}

// Keep bindings outside the edit. Replacing a value directly in the prompt makes that occurrence plain text.
export function rebaseComposerTemplate(template: ComposerTemplate, text: string): ComposerTemplate {
  const before = template.text;
  if (text === before) return template;
  let start = 0;
  while (start < Math.min(before.length, text.length) && before[start] === text[start]) start++;
  let end = before.length;
  const delta = text.length - before.length;
  while (end > start && end + delta > start && before[end - 1] === text[end + delta - 1]) end--;
  const slots = template.slots.flatMap((slot) => {
    if (slot.end <= start) return [slot];
    if (slot.start >= end) return [{ ...slot, start: slot.start + delta, end: slot.end + delta }];
    return [];
  });
  return { ...template, text, slots };
}

export function updateComposerField(
  template: ComposerTemplate,
  key: string,
  value: string,
): ComposerTemplate {
  const values = { ...template.values, [key]: value };
  let text = '';
  let cursor = 0;
  const slots = template.slots.map((slot) => {
    text += template.text.slice(cursor, slot.start);
    const start = text.length;
    text += renderSlot(new PromptTemplate(slot.expression), values);
    cursor = slot.end;
    return { ...slot, start, end: text.length };
  });
  return { text: text + template.text.slice(cursor), slots, values };
}

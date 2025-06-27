import { Markup } from 'telegraf';
import { lessons } from './lessons.js';

export const lessonMarkup = (lessonOrder, ignoreNextButton = false) => {
  const lesson = lessons[lessonOrder];

  if (!lesson) {
    throw new Error('Урок не знайдено!');
  }

  const buttons = [];

  if (!lesson.last) {
    buttons.push(
      Markup.button.callback('Наступний урок', `next_${lesson.order}`)
    );
  }

  return {
    text: `${lesson.description}\n\n${lesson.url}`,
    markup: Markup.inlineKeyboard(buttons),
  };
};

export const getUserByTelegramId = async (db, id) => {
  return db.get('SELECT * FROM user WHERE user_id = ?', [id]);
};

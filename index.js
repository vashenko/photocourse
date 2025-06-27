import { Telegraf, Markup } from 'telegraf';
import express from 'express';
import { WFP, WFP_CONFIG } from 'overshom-wayforpay';
import { v4 as uuidv4 } from 'uuid';
import bodyParser from 'body-parser';
import { openDb } from './init-db.js';
import { lessonMarkup, getUserByTelegramId } from './helpers.js';
import { lessons } from './lessons.js';
import { schedule } from 'node-cron';
import { notifications } from './notifications.js';

WFP_CONFIG.DEFAULT_PAYMENT_CURRENCY = 'UAH';

const wfp = new WFP({
  MERCHANT_ACCOUNT: 'freelance_user_6527f74e6aebe',
  MERCHANT_SECRET_KEY: '8fb36d0105fbd061ca724ca41f87b909c366a58b',
  MERCHANT_DOMAIN_NAME: 'wayforpay.com/freelance',
  SERVICE_URL: 'https://flowery-internal-gander.glitch.me/payment-status',
});

const bot = new Telegraf('6860790776:AAHGYh6_hzhVftIQ0R3QecyVncMpuyvSjrQ');

const mainMenu = Markup.keyboard([
  ['💳 Оплата і початок курсу'],
  ['📚 Список доступних лекцій'],
  ['💬 Написати в чат підтримки'],
]).resize();

openDb().then(async (db) => {
  const app = express();
  const PORT = 3000;

  app.use(
    bodyParser.urlencoded({
      extended: true,
    })
  );
  app.use(bodyParser.json());

  bot.start(async (ctx) => {
    return ctx.reply(
      'Сам собі мобілограф\n\nВітаю! Я точно знаю, що ти хочеш навчитись фотографувати\nшвидко і якісно, тому і підготувала цей міні курс саме для\nтебе!\n\nВ нього входить 7 уроків, де ти дізнаєшся:\n\n✅ як налаштувати камеру свого телефону\n✅ як фотографувати себе без допомоги інших\n✅ як шукати ідеї та реалізовувати їх\n✅ як управляти увагою глядача\n✅ як створити креатив з підручних засобів\n\n8 міні уроків вже чекають на тебе\nДоступ назавжди ❤️\n\nВартість креативного марафону 550 грн і почати ти можеш одразу після сплати - тисни на кнопку в меню.',
      mainMenu
    );
  });

  bot.hears('💳 Оплата і початок курсу', async (ctx) => {
    const user = await getUserByTelegramId(db, ctx.from.id);

    if (user) {
      return ctx.reply('Курс вже сплачено вами!');
    }

    const transactionId = `${ctx.from.id}:${uuidv4()}`;

    const response = await wfp.createInvoiceUrl({
      orderReference: transactionId,
      productName: ['Оплата за курс'],
      productCount: [1],
      productPrice: [550],
    });

    if (response.error) {
      return ctx.reply(
        `Виникла помилка при створені інвойса: ${response.error}`
      );
    }

    return ctx.reply(
      'Для оплати курсу натисни на кнопку «Оплатити».',
      Markup.inlineKeyboard([
        [Markup.button.url('Оплатити', response.value.invoiceUrl)],
      ])
    );
  });

  bot.hears('📚 Список доступних лекцій', async (ctx) => {
    try {
      const user = await getUserByTelegramId(db, ctx.from.id);

      if (!user) {
        return ctx.reply(
          'Для корисутвання ботом, оплатіть курс через кнопку: "💳 Оплата і початок курсу"'
        );
      }

      const buttons = lessons.map((lesson) =>
        Markup.button.callback(
          `${lesson.order}: ${lesson.name}`,
          `lesson_order${lesson.order}`
        )
      );

      return ctx.reply(
        'Список досутпних уроків:',
        Markup.inlineKeyboard(buttons, { columns: 1 })
      );
    } catch (err) {
      return ctx.reply('Виникла помилка', err.message ? err.message : err);
    }
  });

  bot.hears('💬 Написати в чат підтримки', (ctx) => {
    ctx.reply(
      'Напишіть в наш чат підтримки за цим посиланням: https://t.me/+FJ9Ec9VeCMM2ZTQy'
    );
  });

  bot.action(/lesson_order(\d+)/, async (ctx) => {
    const order = ctx.match[1];

    try {
      const user = await getUserByTelegramId(db, ctx.from.id);

      if (!user) {
        return ctx.reply(
          'Для корисутвання ботом, оплатіть курс за допомогою комнади /start'
        );
      }

      const { text, markup } = lessonMarkup(order);

      return ctx.reply(text, { parse_mode: 'Markdown', ...markup });
    } catch (err) {
      return ctx.reply('Виникла помилка', err.message ? err.message : err);
    }
  });
  

  bot.action(/next_(\d+)/, async (ctx) => {
    const prevLessonOrder = ctx.match[1];

    try {
      const user = await getUserByTelegramId(db, ctx.from.id);

      if (!user) {
        return ctx.reply(
          'Для корисутвання ботом, оплатіть курс за допомогою комнади /start'
        );
      }

      const newOrder = Number(prevLessonOrder) + 1;

      const { text, markup } = lessonMarkup(newOrder);

      return ctx.reply(text, { parse_mode: 'Markdown', ...markup });
    } catch (err) {
      console.log('err', err);
      return ctx.reply('Виникла помилка', err.message ? err.message : err);
    }
  });

  app.post('/payment-status', async (req, res) => {
    try {
      const data = wfp.parseAndVerifyIncomingWebhook(req.body);

      if (data.transactionStatus === 'Approved') {
        const [userId] = data.orderReference.split(':');
        const [name, lastName] = data.clientName
          ? data.clientName.split(' ')
          : ['', ''];

        const user = await getUserByTelegramId(db, userId);

        if (user) {
          return res.status(200).json({ message: 'Success' });
        }

        await db.run(
          'INSERT OR IGNORE INTO user (user_id, phone, email, first_name, last_name) VALUES (?, ?, ?, ?, ?)',
          [userId, data.phone, data.email, name, lastName]
        );

        const { text, markup } = lessonMarkup(0);

        await bot.telegram.sendMessage(
          userId,
          `*Для початку вітаю на міні курсі (фото марафоні)! \nЯ - Ірен Бринза, маю досвід роботи в сфері фотографії з 2010 року.\n\nЗ 2018 року займаюсь мобільною фотографією, постійно тестую різні інструменти і тут вижимка з моїх знань, короткі цікаві уроки. \n\nТривалість курсу 7 уроків + нульовий урок, проходити можливо в зручний час просто натиснув на потрібний урок в нижньому меню*! \n\nБажаю тобі натхнення і вдалих кадрів, якщо виникнуть питання - пиши`,
          { parse_mode: 'Markdown' }
        );

        await bot.telegram.sendMessage(userId, text, {
          parse_mode: 'Markdown',
          ...markup,
        });
      }

      res.status(200).json({ message: 'Success' });
    } catch (err) {
      console.log('err', err);
      res.status(400).json({ message: 'Failed', error: err.message });
    }
  });

  schedule('11 30 * * * *', async () => {
    const now = new Date();

    const oneMonthAgo = new Date(now);
    oneMonthAgo.setMonth(now.getMonth() - 1);

    const twoMonthsAgo = new Date(now);
    twoMonthsAgo.setMonth(now.getMonth() - 2);
    // // Check users and send notification
    const users = await db.all('SELECT * FROM user');

    for (const user of users) {
      const createdAt = new Date(user.created_at);

      if (createdAt <= oneMonthAgo && !user.first_notification_sent) {
        const firstNotification = notifications[0];

        await bot.telegram.sendMessage(
          user.user_id,
          firstNotification.message,
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [
                Markup.button.url(
                  firstNotification.buttonText,
                  firstNotification.link
                ),
              ],
            ]),
          }
        );

        await db.run(
          'UPDATE user SET first_notification_sent = true WHERE user_id = ?',
          [user.user_id]
        );
      }

      if (createdAt <= twoMonthsAgo && !user.second_notification_sent) {
        const firstNotification = notifications[1];

        await bot.telegram.sendMessage(
          user.user_id,
          firstNotification.message,
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [
                Markup.button.url(
                  firstNotification.buttonText,
                  firstNotification.link
                ),
              ],
            ]),
          }
        );

        await db.run(
          'UPDATE user SET second_notification_sent = true WHERE user_id = ?',
          [user.user_id]
        );
      }
    }
  });

  bot.launch();
  app.listen(PORT, () => {
    console.log(`Server is started on ${PORT}`);
  });
});

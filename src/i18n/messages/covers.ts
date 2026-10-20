import type { Translation } from '../types';

export const en = {
  'covers.tooLarge': 'That image is too big. Try a smaller one.',
  'covers.use': 'Use my own cover',
  'covers.explain':
    'A cover just for you. Only you will see this cover. We never share it or show it to other readers, because the art belongs to the person who made it.',
  'covers.choose': 'Choose an image',
  'covers.cancel': 'Cancel',
  'covers.onlyYou': 'Only you see this cover.',
  'covers.remove': 'Remove my cover',
  'covers.change': 'Change my cover',
  'covers.chooseAnother': 'Choose another image',
  'covers.customLabel': 'Your own cover for {title}',
  'covers.denied': 'We need access to your photos to choose a cover. You can allow it in your device settings.',
  'covers.uploadFailed': 'We couldn’t save your cover. Please try again.',
  'covers.removeFailed': 'We couldn’t remove your cover. Please try again.',
  'covers.loadFailed': 'We couldn’t load your cover.',
} as const;

export const bg: Translation<typeof en> = {
  'covers.tooLarge': 'Тази картинка е твърде голяма. Опитай с по-малка.',
  'covers.use': 'Моя собствена корица',
  'covers.explain':
    'Корица само за теб. Само ти ще виждаш тази корица. Никога не я споделяме и не я показваме на други читатели, защото изкуството принадлежи на човека, който го е създал.',
  'covers.choose': 'Избери картинка',
  'covers.cancel': 'Отказ',
  'covers.onlyYou': 'Тази корица се вижда само от теб.',
  'covers.remove': 'Махни моята корица',
  'covers.change': 'Смени моята корица',
  'covers.chooseAnother': 'Избери друга картинка',
  'covers.customLabel': 'Твоята собствена корица за {title}',
  'covers.denied': 'Трябва ни достъп до снимките ти, за да избереш корица. Можеш да го разрешиш в настройките на телефона.',
  'covers.uploadFailed': 'Не успяхме да запазим корицата ти. Опитай пак.',
  'covers.removeFailed': 'Не успяхме да махнем корицата ти. Опитай пак.',
  'covers.loadFailed': 'Не успяхме да заредим корицата ти.',
};

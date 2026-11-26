/* Файл настроек сайта.
   Сейчас используются значения по умолчанию из index.html и style.css.
   Админ-панель может скачать новый site-config.js и заменить этот файл —
   тогда изменения увидят все пользователи сайта. */
window.SITE_CONFIG = {
  texts: {
    "hero.animationCaption": "Ваза прайм покачивание",
    "project.dd1": "Илия Хацкевич",
    "project.college": "ВАГПК",
    "project.city": "Воркута",
    "footer.author": "Сделано: Илия Хацкевич, ИСП-25"
  },
  images: {
    "project.emblem": "assets/vagpklogo.webp"
  },
  model: {
    src: "assets/vase_animated.glb",
    scale: 1,
    rotate: false
  }
};

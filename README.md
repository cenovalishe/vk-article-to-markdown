# VK Article to Markdown

Chrome-расширение для экспорта статей ВКонтакте в чистый Markdown (`.md`) файл.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)
![License](https://img.shields.io/badge/license-MIT-brightgreen)

---

## Что делает

Открываете статью на ВКонтакте — нажимаете иконку расширения — получаете `.md` файл с чистым текстом статьи.

Поддерживается:
- Опубликованные статьи — `vk.com/@group-slug`
- Редактор статей — `vk.com/group?z=article_edit…`
- Просмотр статей через оверлей — `vk.com/group?z=article…`

Конвертируется:
- Заголовки `# ## ###`
- **Жирный**, *курсив*, ~~зачёркнутый~~
- Списки (маркированные и нумерованные)
- Цитаты `>`
- Блоки кода
- Таблицы
- Ссылки

---

## Установка

> Расширение не опубликовано в Chrome Web Store. Устанавливается вручную за 1 минуту.

### 1. Скачать

**Вариант А — через Git:**
```bash
git clone https://github.com/cenovalishe/vk-article-to-markdown.git
```

**Вариант Б — архивом:**  
Нажмите **Code → Download ZIP**, распакуйте.

### 2. Установить в Chrome

1. Откройте Chrome и перейдите по адресу:
   ```
   chrome://extensions
   ```

2. Включите **«Режим разработчика»** (переключатель в правом верхнем углу)

   ![Режим разработчика](https://i.imgur.com/placeholder.png)

3. Нажмите **«Загрузить распакованное»**

4. Выберите папку `extension/` из скачанного репозитория

5. Расширение появится на панели инструментов браузера ✅

---

## Использование

1. Откройте любую статью ВКонтакте  
   *(URL должен начинаться с `vk.com/@…` или содержать `?z=article`)*

2. Нажмите иконку **VK → MD** в панели Chrome

3. В попапе появится предпросмотр Markdown

4. Нажмите **«Скачать .md файл»** — откроется диалог сохранения  
   *или* нажмите **«Копировать»** чтобы скопировать текст в буфер обмена

---

## Структура проекта

```
extension/
├── manifest.json              # Manifest V3
├── icons/                     # Иконки 16/32/48/128px
├── popup/
│   ├── popup.html             # UI расширения
│   ├── popup.css              # Стили
│   └── popup.js               # Логика
├── content/
│   └── content.js             # Извлечение и конвертация DOM → Markdown
└── background/
    └── service-worker.js      # Service Worker
```

---

## Требования

- Google Chrome 120+ (или любой Chromium-браузер: Edge, Brave, Opera…)
- Аккаунт ВКонтакте (страницы статей требуют авторизации)

---

## Лицензия

[MIT](LICENSE)

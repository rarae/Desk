# Appwrite + Vue 3 示例（匿名登录 + 数据库）

一个最小可运行的 Vue 3 + Vite 前端项目，演示如何接入 Appwrite 云端实例，
使用**匿名登录**并进行**数据库 CRUD**（以「待办事项」为例）。

## 一、准备你的 Appwrite 信息

在 [Appwrite 控制台](https://cloud.appwrite.io) 中：

1. 创建 / 选择一个 **Project**，记下 **Project ID**。
2. 在 **Auth → Settings** 中启用 **Anonymous（匿名）** 登录方式
   （匿名登录的用户属于 `users` 角色，因此会被当作已登录用户处理）。

## 二、在控制台创建数据库与集合

1. 进入 **Databases → 新建 Database**，记下 **Database ID**。
2. 在该 Database 中 **新建 Collection**，记下 **Collection ID**。
3. 在集合的 **Attributes（属性）** 中添加：
   | Key        | Type    | Size | Required | 说明           |
   |------------|---------|------|----------|----------------|
   | `title`    | String  | 256  | 是       | 待办内容       |
   | `completed`| Boolean | —    | 是       | 是否完成（默认 false）|
   | `userId`   | String  | 64   | 是       | 创建者用户 ID  |
4.（可选，推荐）在集合 **Indexes（索引）** 添加：
   - Key：`userId`，Type：`Key`，Attributes：`userId`
   以便按用户筛选（本示例已使用 `Query.equal('userId', …)`）。
5. 在集合 **Settings → Permissions（权限）** 添加一条：
   - Role：`users`，勾选 **Create**
   （匿名用户属于 `users`，需要此权限才能在集合中创建文档；
    读取/更新/删除权限在代码里按文档级精确控制，仅本人可操作）。

## 三、配置本地环境变量

将 `.env.example` 复制为 `.env` 并填入真实值：

```bash
cp .env.example .env
```

编辑 `.env`：

```ini
VITE_APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
VITE_APPWRITE_PROJECT_ID=你的_project_id
VITE_APPWRITE_DATABASE_ID=你的_database_id
VITE_APPWRITE_TODO_COLLECTION_ID=你的_collection_id
```

## 四、安装依赖并运行

```bash
npm install
npm run dev
```

打开 http://localhost:5173 ，点击右上角「匿名登录」，即可添加 / 勾选 / 删除待办。
数据会持久化到你的 Appwrite 数据库，且每个匿名用户只能看到自己创建的待办。

## 五、项目结构

```
src/
├── lib/appwrite.js        # Appwrite 客户端单例与导出
├── composables/
│   ├── useAuth.js         # 匿名登录 / 会话恢复 / 登出
│   └── useTodos.js        # 待办数据库 CRUD + 文档级权限
├── components/
│   ├── AuthPanel.vue      # 登录状态面板
│   └── TodoList.vue       # 待办列表界面
├── App.vue                # 根组件
└── main.js                # 入口
```

## 六、注意事项

- 匿名登录每次会创建一个独立匿名用户；不同设备/浏览器会话互不关联。
  如需「同一用户多端同步」，应改用邮箱密码或 OAuth 登录。
- `VITE_` 前缀的变量会暴露到浏览器，请勿在其中放置 API Key。
  服务端（云函数 / Node 脚本）才使用带 `users` 权限的 API Key。
- 生产环境建议收紧集合权限，并结合官方安全最佳实践。

# AI Service Matching Platform - Backend API

## 概述
这是一个AI驱动的服务匹配平台后端API，用于连接用户和服务提供者（Companions）。

## 技术栈
- **Node.js** + **TypeScript**
- **Express.js** - Web框架
- **Prisma** - ORM
- **PostgreSQL** - 数据库
- **JWT** - 身份验证
- **OpenAI API** - AI匹配和聊天
- **Stripe** - 支付处理
- **WebSocket** - 实时聊天

## 快速开始

### 1. 安装依赖
```bash
npm install
```

### 2. 配置环境变量
```bash
cp .env.example .env
# 编辑 .env 文件，填入你的配置
```

### 3. 设置数据库
```bash
# 运行数据库迁移
npm run db:migrate

# 生成Prisma客户端
npm run db:generate

# 填充示例数据
npm run db:seed
```

### 4. 启动开发服务器
```bash
npm run dev
```

服务器将在 http://localhost:3000 启动

## API 端点

### 认证
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/refresh` - 刷新token
- `GET /api/auth/me` - 获取当前用户信息

### Companions（服务提供者）
- `GET /api/companions` - 获取所有companions列表
- `GET /api/companions/:id` - 获取单个companion详情
- `POST /api/companions/search` - AI驱动的智能搜索
- `GET /api/companions/:id/availability` - 获取可用时间

### 预订
- `GET /api/bookings` - 获取用户的预订
- `POST /api/bookings` - 创建新预订
- `PATCH /api/bookings/:id` - 更新预订状态
- `DELETE /api/bookings/:id` - 取消预订

### 聊天
- `POST /api/chat/ai` - AI助手对话
- `GET /api/chat/messages/:companionId` - 获取与companion的消息
- `POST /api/chat/messages` - 发送消息

### 评价
- `GET /api/reviews/:companionId` - 获取评价
- `POST /api/reviews` - 创建评价

### 支付
- `POST /api/payments/create-intent` - 创建支付意图
- `POST /api/payments/webhook` - Stripe webhook

## 数据库模型

### User
用户账户信息

### Companion
服务提供者信息（资料、技能、可用性）

### Booking
预订记录（状态、时间、价格）

### Review
用户评价和评分

### Message
聊天消息记录

### Payment
支付交易记录

## 开发命令

```bash
npm run dev          # 开发模式（热重载）
npm run build        # 构建生产版本
npm run start        # 运行生产版本
npm run db:migrate   # 运行数据库迁移
npm run db:seed      # 填充示例数据
```

## 生产部署

1. 设置PostgreSQL数据库
2. 配置环境变量
3. 运行数据库迁移
4. 构建项目
5. 启动服务器

```bash
npm run build
npm start
```

## 安全注意事项

- 在生产环境中更改JWT_SECRET
- 使用HTTPS
- 设置适当的CORS策略
- 限制API请求速率
- 定期更新依赖项

## License

MIT

# 构建说明

此包包含网站后端、桌面包装源码、缩放修复补丁及现有公共前端运行资源。原软件的完整未编译源码未提供；Android APK 为对现存程序资源的修改与重新签名产物。

## Windows

安装 Node.js 24。在 desktop-app 内执行 npm ci，然后 npm run dist。web 目录为已同步网页资源；安装器输出到 dist。需自行配置 Authenticode 证书才能签名 Windows 程序。

## 网站

public-site 内执行 npm ci 与 npm run build。运行时需配置 D1 数据库 DB，应用 drizzle 中迁移。配置 STEEL_KEY_SALT、STEEL_KEY_HASH、STEEL_PEPPER、STEEL_ASSET_KEY 四个秘密：salt/pepper 为随机 Base64，hash 为 PBKDF2-SHA256（100000轮、32字节）的 Base64 验证值，asset key 为 AES-256-GCM 的 Base64 密钥。示例仅占位，生产秘密未提供。现有铸钢密文与生产授权服务配套，自建版本需要原作者许可及自己的加密素材。

网页与原生客户端的授权 API 地址由 assets/unlock-client.js 配置；原生版本默认使用已发布网站。网页通过 HttpOnly Cookie，原生通过短期 Bearer 会话令牌验证，24小时到期。

## 许可

先阅读 LICENSE.md、NOTICE.md、LICENSING_SCOPE.md 和 modules.json。包内铸钢渲染及密文不属于浅泽 CC 授权；原程序、依赖、字体及官方素材保留原有权利。

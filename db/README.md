# 账号数据库迁移

`NNNN-名称.sql` 按文件名顺序执行，每个文件只执行一次：执行与在 `qinban_meta.schema_migrations` 中登记文件名和 SHA-256 位于同一事务，失败则整体回滚、不登记。

- 本机 PGlite（`.local/accounts-v1/postgres`）每次启动自动应用尚未执行的迁移。
- 生产环境的服务进程不迁移数据库。部署新版本前，以表所有者的维护连接执行 `QINBAN_MIGRATION_DATABASE_URL=… npm run accounts:migrate`（要求 TLS），再启动服务；运行时身份不能访问 `qinban_meta`。
- **已执行的文件不能再改。** 启动时发现内容变化、或数据库登记了这里没有的文件，会拒绝启动。需要修改时新增下一个编号的文件。
- 新表需要在同一迁移中授予 `qinban_identity` / `qinban_library` 对应权限并启用 RLS；之前的文件不会再重跑，不会替新表补授权。
- 0001–0006 来自引入版本表之前，当时每次启动都会整体重跑，因此全部可重复执行；已有数据库第一次升级时会再执行一遍并登记。

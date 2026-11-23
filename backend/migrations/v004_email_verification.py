from sqlalchemy import inspect, text

VERSION = "004_email_verification"


def upgrade(connection) -> None:
    columns = {c["name"] for c in inspect(connection).get_columns("users")}
    if "email_verified" not in columns:
        connection.execute(text("ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE NOT NULL"))
        # accounts created before verification existed keep working
        connection.execute(text("UPDATE users SET email_verified = TRUE"))

"""Run with: python -m app.database.check_connection (from backend/)."""
import sys
from pymongo.errors import PyMongoError
from app.core.config import settings
from app.database.connection import get_mongo_db


def main():
    if not settings.mongodb_uri:
        print('MongoDB is not configured. Set MONGODB_URI in backend/.env.')
        return 1
    try:
        database = get_mongo_db()
        database.command('ping')
        database.ports.find_one({'_id': 'NMP'}, {'_id': 1})
        print(f'MongoDB ping and application read succeeded: {database.name}.ports')
        return 0
    except (PyMongoError, ValueError) as exc:
        # Do not print connection details or credentials in error output.
        print(f'MongoDB connection failed ({type(exc).__name__}). Check credentials, Atlas network access, and DNS.')
        return 1


if __name__ == '__main__':
    sys.exit(main())

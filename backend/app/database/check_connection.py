"""Run with: python -m app.database.check_connection (from backend/)."""
import sys
from pymongo import MongoClient
from pymongo.errors import PyMongoError
from app.core.config import settings


def main():
    if not settings.mongodb_uri:
        print('MongoDB is not configured. Set MONGODB_URI in backend/.env.')
        return 1
    try:
        with MongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=10000) as client:
            client.admin.command('ping')
            database = client[settings.mongodb_db]
            database.port_state.find_one({'_id': 'NMP'}, {'_id': 1})
            print(f'MongoDB ping and application read succeeded: {database.name}.port_state')
        return 0
    except (PyMongoError, ValueError) as exc:
        # Do not print connection details or credentials in error output.
        print(f'MongoDB connection failed ({type(exc).__name__}). Check credentials, Atlas network access, and DNS.')
        return 1


if __name__ == '__main__':
    sys.exit(main())

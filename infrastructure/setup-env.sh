#!/bin/bash

# Setup script for infrastructure environment variables

echo "🔧 Setting up infrastructure environment variables..."

# Check if .env already exists
if [ -f ".env" ]; then
    echo "⚠️  .env file already exists. Do you want to overwrite it? (y/n)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        echo "📋 Copying env.template to .env..."
        cp env.template .env
        echo "✅ .env file created/updated!"
        echo ""
        echo "📝 Please edit the .env file and add your actual API keys:"
        echo "   - RUNWAY_API_KEY"
        echo "   - OPENAI_API_KEY"
    else
        echo "❌ Setup cancelled."
        exit 1
    fi
else
    echo "📋 Copying env.template to .env..."
    cp env.template .env
    echo "✅ .env file created!"
    echo ""
    echo "📝 Please edit the .env file and add your actual API keys:"
    echo "   - RUNWAY_API_KEY"
    echo "   - OPENAI_API_KEY"
fi

echo ""
echo "🚀 After adding your API keys, you can deploy with:"
echo "   npm run deploy" 
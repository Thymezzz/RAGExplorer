import requests
import json

def get_models():
    url = "https://openrouter.ai/api/v1/models"
    response = requests.get(url)
    return response.json()

def format_price(pricing):
    """Format pricing information for display"""
    prompt_price = float(pricing.get('prompt', 0))
    completion_price = float(pricing.get('completion', 0))
    
    if prompt_price == 0 and completion_price == 0:
        return "Free"
    else:
        return f"Input: ${prompt_price:.8f}/token, Output: ${completion_price:.8f}/token"

def extract_model_info():
    """Extract and format model information"""
    try:
        data = get_models()
        models = data.get('data', [])
        
        # Calculate price for each model and prepare for sorting
        model_list = []
        for model in models:
            model_id = model.get('id', 'N/A')
            name = model.get('name', 'N/A')
            pricing = model.get('pricing', {})
            
            # Calculate total price (input + output)
            prompt_price = float(pricing.get('prompt', 0))
            completion_price = float(pricing.get('completion', 0))
            total_price = prompt_price + completion_price
            
            # If free model, set price to 0
            if prompt_price == 0 and completion_price == 0:
                total_price = 0
            
            price_info = format_price(pricing)
            
            # Truncate long names for better display
            if len(name) > 38:
                name = name[:35] + "..."
            
            model_list.append({
                'id': model_id,
                'name': name,
                'price_info': price_info,
                'total_price': total_price
            })
        
        # Sort by price from high to low
        model_list.sort(key=lambda x: x['total_price'], reverse=True)
        
        # Prepare output content
        output_lines = []
        output_lines.append("Available Models List - Sorted by Price (High to Low)")
        output_lines.append("=" * 80)
        output_lines.append(f"{'ID':<50} {'Name':<40} {'Price'}")
        output_lines.append("-" * 80)
        
        for model in model_list:
            line = f"{model['id']:<50} {model['name']:<40} {model['price_info']}"
            output_lines.append(line)
        
        output_lines.append("-" * 80)
        output_lines.append(f"Total: {len(models)} models")
        
        # Output to console
        for line in output_lines:
            print(line)
        
        # Save to file
        output_content = '\n'.join(output_lines)
        with open('available_models.txt', 'w', encoding='utf-8') as f:
            f.write(output_content)
        
        print(f"\nResults saved to: available_models.txt")
        
        # Save raw data in JSON format
        with open('models_data.json', 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        print(f"Raw data saved to: models_data.json")
        
    except Exception as e:
        print(f"Error fetching model information: {e}")

if __name__ == "__main__":
    extract_model_info()

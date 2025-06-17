from PIL import Image, ImageDraw
import os

# Image dimensions and colors
width, height = 1536, 1024
line_color = (0, 0, 0)  # Black
background_color = (255, 255, 255)  # White

# Create a new white image
image = Image.new("RGB", (width, height), background_color)
draw = ImageDraw.Draw(image)

# Calculate the middle X-coordinate
middle_x = width // 2

# Draw a 2-pixel wide vertical line in the middle
# We draw two adjacent 1px lines to achieve this thickness
draw.line([(middle_x - 1, 0), (middle_x - 1, height)], fill=line_color, width=1)
draw.line([(middle_x, 0), (middle_x, height)], fill=line_color, width=1)

# Define the directory and file path for the image
# The image will be saved in the same directory as this script
script_dir = os.path.dirname(os.path.abspath(__file__))
file_name = "base_split_image_1536x1024.png"
file_path = os.path.join(script_dir, file_name)

# Save the image
try:
    image.save(file_path)
    print(f"Base split image successfully saved to: {file_path}")
except Exception as e:
    print(f"Error saving image: {e}") 
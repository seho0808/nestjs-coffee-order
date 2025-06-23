import {
  Controller,
  Get,
  Param,
  NotFoundException,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { MenuService } from './menu.service';
import { MenuResponseDto, PopularMenuResponseDto } from './dto';
import { ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';

@Controller('menus')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @ApiOperation({ summary: '모든 메뉴 조회' })
  @ApiResponse({
    status: 200,
    description: '모든 메뉴 조회 성공',
    type: [MenuResponseDto],
  })
  @HttpCode(HttpStatus.OK)
  @Get()
  async getAllMenus(): Promise<MenuResponseDto[]> {
    return this.menuService.getAllMenus();
  }

  @ApiOperation({
    summary: '인기 메뉴 조회',
    description: '최근 7일간 인기있는 메뉴 3개를 조회합니다.',
  })
  @ApiResponse({
    status: 200,
    description: '인기 메뉴 조회 성공',
    type: [PopularMenuResponseDto],
  })
  @HttpCode(HttpStatus.OK)
  @Get('popular')
  async getPopularMenus(): Promise<PopularMenuResponseDto> {
    return this.menuService.getPopularMenus();
  }

  @ApiOperation({ summary: '메뉴 상세 조회' })
  @ApiParam({
    name: 'id',
    description: '메뉴 UUID',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @ApiResponse({
    status: 200,
    description: '메뉴 상세 조회 성공',
    type: MenuResponseDto,
  })
  @HttpCode(HttpStatus.OK)
  @Get(':id')
  async getMenuById(@Param('id') id: string): Promise<MenuResponseDto> {
    try {
      const menu = await this.menuService.getMenuById(id);
      if (!menu) {
        throw new NotFoundException(`Menu with ID ${id} not found`);
      }
      return menu;
    } catch (error) {
      if (error.message === 'Invalid UUID format') {
        throw new NotFoundException(`Menu with ID ${id} not found`);
      }
      throw error;
    }
  }
}
